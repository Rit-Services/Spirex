// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { projectModel, projectMemberModel } from '../../models/project/project.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { deriveKey, withSuffix } from '../../utils/projectKey.js';
import { workflowService } from '../workflow/workflowService.js';
import { storage } from '../storage/index.js';
import logger from '../../utils/logger.js';
import type { ProjectRole } from '../../utils/permissions.js';

interface CreateProjectInput {
  name: string;
  description?: string | null;
  defaultSprintLengthWeeks?: number;
  createdById: string;
  // Phase 13: home organization for the new project (from req.orgContext).
  organizationId: string;
  key?: string;
  // Methodology, fixed at creation. Anything other than 'kanban' falls back to
  // 'scrum' so a malformed body can never write an invalid enum.
  type?: 'scrum' | 'kanban';
}

export const projectService = {
  async create(input: CreateProjectInput) {
    const base = input.key?.toUpperCase().replace(/[^A-Z0-9]/g, '') || deriveKey(input.name);
    if (!base) throw ErrorResponse.badRequest('Could not derive a project key from the name');

    // Collision-retry: base, base2, base3, …
    let key = base;
    let attempt = 1;
    while (await projectModel.findByKey(key)) {
      attempt += 1;
      if (attempt > 50) throw ErrorResponse.conflict('Could not find an available project key');
      key = withSuffix(base, attempt);
    }

    // Creator is auto-added as lead in the same transaction.
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          key,
          name: input.name,
          description: input.description ?? null,
          // TEMP: Kanban creation is disabled until the flow-metrics / explicit-policy
          // gaps are addressed (see memory: kanban-gaps-and-creation-disabled). Force
          // scrum regardless of the requested type so the API can't be used to bypass
          // the disabled UI card. Revert to `input.type === 'kanban' ? 'kanban' : 'scrum'`
          // to re-enable. Existing kanban projects are untouched.
          type: 'scrum',
          defaultSprintLengthWeeks: input.defaultSprintLengthWeeks ?? 2,
          createdById: input.createdById,
          organizationId: input.organizationId,
        },
      });
      await tx.projectMember.create({
        data: { projectId: project.id, userId: input.createdById, projectRole: 'lead' },
      });
      // Every project gets the six default workflow rows so the board/filters
      // can render dynamic columns out of the box.
      await workflowService.seedDefaults(project.id, tx);
      return tx.project.findUnique({
        where: { id: project.id },
        include: { members: { include: { user: true } } },
      });
    });
  },

  listForUser(userId: string, organizationId: string) {
    return projectModel.listForUser(userId, organizationId);
  },

  listAll() {
    return projectModel.listAll();
  },

  listForOrg(organizationId: string) {
    return projectModel.listForOrg(organizationId);
  },

  async getById(id: string) {
    const project = await projectModel.findById(id);
    if (!project) throw ErrorResponse.notFound('Project not found');
    return project;
  },

  async getMembership(projectId: string, userId: string) {
    return projectMemberModel.findForUser(projectId, userId);
  },

  async update(
    id: string,
    data: { name?: string; description?: string | null; defaultSprintLengthWeeks?: number },
  ) {
    return projectModel.update(id, data);
  },

  async delete(id: string) {
    // Capture every attachment file path BEFORE deletion. Attachment.projectId
    // is always set (story files, epic/project-level files, image+voice import
    // sources alike), so a single projectId query covers the whole project.
    // Prisma's onDelete: Cascade wipes the Attachment ROWS when the project is
    // deleted but knows nothing about the storage backend — without this the
    // physical files (now whole imported JIRA media libraries) orphan forever
    // on disk / S3. Mirrors the proven cleanup in storyService.remove.
    const attachments = await prisma.attachment.findMany({
      where: { projectId: id },
      select: { path: true },
    });

    const result = await projectModel.delete(id);

    // After the row cascade commits, best-effort unlink files. The storage
    // adapter swallows ENOENT, so partial/double deletes are safe.
    await Promise.all(
      attachments.map((a) =>
        storage.remove(a.path).catch((err) => {
          logger.warn(`failed to unlink attachment ${a.path}`, err);
        }),
      ),
    );

    return result;
  },
};

export const projectMemberService = {
  list(projectId: string) {
    return projectMemberModel.list(projectId);
  },

  async upsert(projectId: string, userId: string, projectRole: ProjectRole) {
    return projectMemberModel.upsert({ projectId, userId, projectRole });
  },

  async remove(projectId: string, userId: string) {
    const existing = await projectMemberModel.findForUser(projectId, userId);
    if (!existing) throw ErrorResponse.notFound('Membership not found');
    if (existing.projectRole === 'lead') {
      const leads = await prisma.projectMember.count({
        where: { projectId, projectRole: 'lead' },
      });
      if (leads <= 1) throw ErrorResponse.badRequest('Cannot remove the last project lead');
    }
    return projectMemberModel.remove(projectId, userId);
  },
};

// ── Unlinked (external/ghost) users ───────────────────────────────────────────
// JIRA people who didn't map to a real account on import exist only to attribute
// work truthfully ("Name (unlinked)"). This service surfaces the ones with work
// in a given project and lets a lead reassign that work to a real member —
// PROJECT-SCOPED: only this project's rows move, and the ghost is left alive
// because it may still own work in other projects.

export const unlinkedUserService = {
  /**
   * Every external/ghost user with at least one attributed item in this project,
   * with a rough count of how many references they hold (reporter/assignee on a
   * story, epic creator, attachment uploader, comment author). Used by project
   * settings to show "who still needs linking".
   */
  async listForProject(projectId: string) {
    const [stories, epics, attachments, comments] = await Promise.all([
      prisma.story.findMany({ where: { projectId }, select: { reporterId: true, assigneeId: true } }),
      prisma.epic.findMany({ where: { projectId }, select: { createdById: true } }),
      prisma.attachment.findMany({ where: { projectId }, select: { uploadedById: true } }),
      // Comments carry no projectId — they belong to a story, so scope by it.
      prisma.comment.findMany({ where: { story: { projectId } }, select: { authorId: true } }),
    ]);

    // Tally references per user across every attribution surface, then keep only
    // the ghosts (real members are filtered out by isExternal below).
    const counts = new Map<string, number>();
    const bump = (id: string | null | undefined) => {
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    };
    for (const s of stories) { bump(s.reporterId); bump(s.assigneeId); }
    for (const e of epics) bump(e.createdById);
    for (const a of attachments) bump(a.uploadedById);
    for (const c of comments) bump(c.authorId);

    const ids = [...counts.keys()];
    if (ids.length === 0) return [];

    const ghosts = await prisma.user.findMany({
      where: { id: { in: ids }, isExternal: true },
      select: { id: true, name: true, externalSource: true, externalId: true },
    });

    return ghosts
      .map((g) => ({ ...g, itemCount: counts.get(g.id) ?? 0 }))
      .sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name));
  },

  /**
   * Link a ghost to a real project member: reassign all of the ghost's items IN
   * THIS PROJECT (reporter/assignee/epic creator/attachment uploader/comment
   * author) to the target, atomically. The ghost row is left untouched so any
   * work it owns in OTHER projects keeps attributing truthfully. Returns how many
   * rows moved.
   */
  async link(projectId: string, ghostId: string, targetUserId: string) {
    if (ghostId === targetUserId) {
      throw ErrorResponse.badRequest('Cannot link a user to itself');
    }
    const [ghost, target, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: ghostId }, select: { id: true, isExternal: true } }),
      prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isExternal: true } }),
      projectMemberModel.findForUser(projectId, targetUserId),
    ]);
    if (!ghost?.isExternal) throw ErrorResponse.badRequest('Source is not an unlinked user');
    if (!target || target.isExternal) throw ErrorResponse.badRequest('Target must be a real account');
    if (!membership) throw ErrorResponse.badRequest('Target user must be a member of this project');

    return prisma.$transaction(async (tx) => {
      // updateMany can't filter on a relation, so resolve this project's story ids
      // once to scope the comment reassignment.
      const storyIds = (
        await tx.story.findMany({ where: { projectId }, select: { id: true } })
      ).map((s) => s.id);

      const reporters = await tx.story.updateMany({
        where: { projectId, reporterId: ghostId },
        data: { reporterId: targetUserId },
      });
      const assignees = await tx.story.updateMany({
        where: { projectId, assigneeId: ghostId },
        data: { assigneeId: targetUserId },
      });
      const epicsMoved = await tx.epic.updateMany({
        where: { projectId, createdById: ghostId },
        data: { createdById: targetUserId },
      });
      const attachmentsMoved = await tx.attachment.updateMany({
        where: { projectId, uploadedById: ghostId },
        data: { uploadedById: targetUserId },
      });
      const commentsMoved = storyIds.length
        ? await tx.comment.updateMany({
            where: { storyId: { in: storyIds }, authorId: ghostId },
            data: { authorId: targetUserId },
          })
        : { count: 0 };

      return {
        reassigned:
          reporters.count +
          assignees.count +
          epicsMoved.count +
          attachmentsMoved.count +
          commentsMoved.count,
      };
    });
  },
};
