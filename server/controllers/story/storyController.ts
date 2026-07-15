// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { storyService } from '../../services/story/storyService.js';
import { labelService } from '../../services/label/labelService.js';
import { sprintService } from '../../services/sprint/sprintService.js';
import { activityService } from '../../services/activity/activityService.js';
import { notificationService } from '../../services/notification/notificationService.js';
import { claudeRunner } from '../../services/ai/claudeRunner.js';
import type { StoryEnhanceContext } from '../../services/ai/promptBuilder.js';
import { tiptapPlainText } from '../../utils/tiptapPlainText.js';
import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction } from '../../utils/projectAccess.js';
import type { StoryListQuery } from '../../validators/storyValidator.js';
import type { StoryStatus } from '@prisma/client';

// Core statuses a user can filter the "My issues" widget by — `done` is
// intentionally absent (completed issues never show in this widget).
const ASSIGNABLE_FILTER_STATUSES: StoryStatus[] = ['todo', 'in_progress', 'in_review', 'qa'];

/**
 * Attach the viewer's watch state (`isWatching` + `watcherCount`) to a
 * single-story response payload so the detail panel can render the eye toggle.
 */
async function withWatch(story: { id: string } | null, userId: string) {
  if (!story) return story;
  const watch = await notificationService.getWatchState(story.id, userId);
  return { ...story, ...watch };
}

/**
 * Parse the JSON-encoded `customFields` list-query param into a scalar map.
 * Malformed JSON / non-scalar entries are dropped rather than 400ing — a
 * stale or hand-edited URL should degrade to "filter ignored", not an error.
 */
function parseCustomFieldFilters(
  raw: string | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  } catch {
    return undefined;
  }
}

/** Assemble the ticket context the enhancement prompts work from. */
async function buildEnhanceContext(
  story: NonNullable<Awaited<ReturnType<typeof storyService.get>>>,
): Promise<StoryEnhanceContext> {
  const project = await prisma.project.findUnique({
    where: { id: story.projectId },
    select: { name: true },
  });
  return {
    key: story.key,
    title: story.title,
    type: story.type,
    priority: story.priority,
    projectName: project?.name ?? null,
    epicTitle: story.epic?.title ?? null,
    description: tiptapPlainText(story.description),
    acceptanceCriteria: story.acceptanceCriteria,
    subtaskTitles: (story.subtasks ?? []).map((s) => s.title),
  };
}

export const storyController = {
  async list(req: Request, res: Response) {
    const q = req.query as unknown as StoryListQuery;
    await assertProjectAction(req, q.projectId, 'project:view');
    const sprintId = q.sprintId === 'null' ? null : q.sprintId;
    const epicId = q.epicId === 'null' ? null : q.epicId;
    const parentStoryId =
      q.parentStoryId === 'null' ? null : q.parentStoryId ?? undefined;
    const stories = await storyService.list({
      projectId: q.projectId,
      sprintId,
      inOpenSprints: q.inOpenSprints === 'true',
      status: q.status,
      statusId: q.statusId,
      assigneeId: q.assigneeId,
      epicId,
      labelId: q.labelId,
      type: q.type,
      priority: q.priority,
      search: q.search,
      parentStoryId,
      includeSubtasks: q.includeSubtasks === 'true',
      customFields: parseCustomFieldFilters(q.customFields),
    });
    res.json({ stories });
  },

  /**
   * Dashboard "My issues" — issues assigned to the caller across every project
   * in their active org. Scoped by `assigneeId = me` + the org context, so it
   * never leaks work from a project/org the caller isn't part of.
   */
  async assignedToMe(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const organizationId = req.orgContext?.orgId;
    if (!organizationId) throw ErrorResponse.badRequest('No active organization');

    const raw = typeof req.query.statuses === 'string' ? req.query.statuses : '';
    const statuses = raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is StoryStatus => (ASSIGNABLE_FILTER_STATUSES as string[]).includes(s))
      : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const data = await storyService.assignedToMe({
      userId: req.user.id,
      organizationId,
      statuses,
      limit,
    });
    res.json(data);
  },

  async get(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'project:view');
    if (!req.user) throw ErrorResponse.unauthorized();
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async getByKey(req: Request, res: Response) {
    const story = await storyService.getByKey(req.params.key);
    if (!story) throw ErrorResponse.notFound('Story not found');
    await assertProjectAction(req, story.projectId, 'project:view');
    if (!req.user) throw ErrorResponse.unauthorized();
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async create(req: Request, res: Response) {
    const projectId = String(req.body.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertProjectAction(req, projectId, 'story:create');
    if (!req.user) throw ErrorResponse.unauthorized();

    const story = await storyService.create(
      {
        projectId,
        title: req.body.title,
        description: req.body.description ?? null,
        acceptanceCriteria: req.body.acceptanceCriteria ?? null,
        type: req.body.type,
        priority: req.body.priority,
        // Default to 1 point when none is given — people routinely forget to
        // estimate, which leaves the sprint board/burndown reading 0% forever.
        // `?? 1` only fills null/undefined, so an explicit 0 is still respected.
        // This is the MANUAL-create boundary only: clone calls the service
        // directly and Jira import has its own path, so neither is affected.
        storyPoints: req.body.storyPoints ?? 1,
        originalEstimateMinutes: req.body.originalEstimateMinutes ?? null,
        epicId: req.body.epicId ?? null,
        sprintId: req.body.sprintId ?? null,
        status: req.body.status,
        assigneeId: req.body.assigneeId ?? null,
        reporterId: req.user.id,
        parentStoryId: req.body.parentStoryId ?? null,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        customFields: req.body.customFields,
        labelIds: req.body.labelIds,
      },
      req.user.id,
    );
    res.status(201).json({ story: await withWatch(story, req.user.id) });
  },

  async update(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    if (req.body.assigneeId !== undefined && req.body.assigneeId !== existing.assigneeId) {
      await assertProjectAction(req, existing.projectId, 'story:assign');
    } else {
      await assertProjectAction(req, existing.projectId, 'story:edit');
    }
    if (!req.user) throw ErrorResponse.unauthorized();
    const story = await storyService.update(
      req.params.id,
      {
        ...req.body,
        // Same undefined-preserving date parse as epicController: absent key
        // means "don't touch", null/'' means "clear".
        startDate:
          req.body.startDate !== undefined
            ? (req.body.startDate ? new Date(req.body.startDate) : null)
            : undefined,
        dueDate:
          req.body.dueDate !== undefined
            ? (req.body.dueDate ? new Date(req.body.dueDate) : null)
            : undefined,
      },
      req.user.id,
    );
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async changeStatus(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:status');
    if (!req.user) throw ErrorResponse.unauthorized();
    const story = await storyService.changeStatus(req.params.id, req.body.status, req.user.id);
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async changeStatusRow(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:status');
    if (!req.user) throw ErrorResponse.unauthorized();
    const story = await storyService.changeStatusRow(
      req.params.id,
      req.body.statusRowId,
      req.user.id,
      { cascadeSubtasks: req.body.cascadeSubtasks === true },
    );
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async reorder(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:status');
    if (!req.user) throw ErrorResponse.unauthorized();
    const { prevId, nextId } = req.body as { prevId?: string | null; nextId?: string | null };
    const story = await storyService.reorder(req.params.id, prevId ?? null, nextId ?? null);
    res.json({ story: await withWatch(story, req.user.id) });
  },

  /**
   * AI ticket enhancement — returns a DRAFT {title, description,
   * acceptanceCriteria} and saves NOTHING. The user reviews the draft in a
   * confirm dialog; applying it goes through the normal PATCH /stories/:id,
   * so activity logging and notifications need no special handling here.
   */
  async aiEnhance(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'story:edit');
    const draft = await claudeRunner.enhanceStory(await buildEnhanceContext(story));
    res.json({ draft });
  },

  /** AI acceptance-criteria draft — same contract: draft only, nothing saved. */
  async aiAcceptanceCriteria(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'story:edit');
    const acceptanceCriteria = await claudeRunner.generateAcceptanceCriteria(
      await buildEnhanceContext(story),
    );
    res.json({ acceptanceCriteria });
  },

  async watch(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'project:view');
    if (!req.user) throw ErrorResponse.unauthorized();
    const watch = await notificationService.watch(story.id, req.user.id);
    res.json({ watch });
  },

  async unwatch(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'project:view');
    if (!req.user) throw ErrorResponse.unauthorized();
    const watch = await notificationService.unwatch(story.id, req.user.id);
    res.json({ watch });
  },

  async watchers(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'project:view');
    const watchers = await notificationService.listWatchers(story.id);
    res.json({ watchers });
  },

  async remove(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:delete');
    await storyService.remove(req.params.id);
    res.status(204).end();
  },

  async activity(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'project:view');
    const activity = await activityService.listByStory(story.id);
    res.json({ activity });
  },

  /**
   * Attach a label to this story. Gated on story:edit — "anyone who can edit
   * the ticket can label it". Returns the freshly hydrated story so the client
   * patches it in place via the same path as any other story update.
   */
  async addLabel(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:edit');
    if (!req.user) throw ErrorResponse.unauthorized();
    await labelService.attachToStory(existing.id, req.body.labelId);
    const story = await storyService.get(existing.id);
    res.json({ story: await withWatch(story, req.user.id) });
  },

  /** Detach a label from this story (no-op if it wasn't attached). */
  async removeLabel(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:edit');
    if (!req.user) throw ErrorResponse.unauthorized();
    await labelService.detachFromStory(existing.id, req.params.labelId);
    const story = await storyService.get(existing.id);
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async changeSprint(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:sprint-move');
    if (!req.user) throw ErrorResponse.unauthorized();
    const nextSprintId: string | null = req.body?.sprintId ?? null;
    await sprintService.moveStoryToSprint(req.params.id, nextSprintId, req.user.id);
    const story = await storyService.get(req.params.id);
    res.json({ story: await withWatch(story, req.user.id) });
  },

  async listLinks(req: Request, res: Response) {
    const story = await storyService.get(req.params.id);
    await assertProjectAction(req, story.projectId, 'project:view');
    const links = await storyService.listLinks(story.id);
    res.json({ links });
  },

  async createLink(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:edit');
    if (!req.user) throw ErrorResponse.unauthorized();
    const link = await storyService.linkStories({
      sourceId: existing.id,
      targetId: req.body.targetId,
      type: req.body.type,
      actorId: req.user.id,
    });
    res.status(201).json({ link });
  },

  async reiterate(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:create');
    if (!req.user) throw ErrorResponse.unauthorized();
    const story = await storyService.reiterate(existing.id, req.user.id);
    res.status(201).json({ story: await withWatch(story, req.user.id) });
  },

  async removeLink(req: Request, res: Response) {
    const existing = await storyService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'story:edit');
    if (!req.user) throw ErrorResponse.unauthorized();
    await storyService.unlinkStories(req.params.linkId, req.user.id);
    res.status(204).end();
  },
};
