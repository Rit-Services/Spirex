// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { sprintModel } from '../../models/sprint/sprint.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { activityService } from '../activity/activityService.js';
import { notificationService } from '../notification/notificationService.js';
import logger from '../../utils/logger.js';
import type { SprintStatus } from '@prisma/client';

interface CreateSprintInput {
  projectId: string;
  name?: string;
  goal?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdById: string;
}

export const sprintService = {
  list(projectId: string) {
    return sprintModel.list(projectId);
  },

  async get(id: string) {
    const sprint = await sprintModel.findById(id);
    if (!sprint) throw ErrorResponse.notFound('Sprint not found');
    return sprint;
  },

  /**
   * Full detail payload for the SprintDetail view: the sprint itself plus every
   * story (current snapshot — completed sprints keep their stories by design)
   * and a report block with committed-vs-completed points and incomplete count.
   */
  async getDetail(id: string) {
    const sprint = await sprintModel.findById(id);
    if (!sprint) throw ErrorResponse.notFound('Sprint not found');

    const stories = await prisma.story.findMany({
      where: { sprintId: id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
        reporter: { select: { id: true, name: true, email: true, avatarUrl: true } },
        epic: { select: { id: true, key: true, title: true, color: true } },
      },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    });

    const committedPoints = stories.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
    const completedPoints = stories
      .filter((s) => s.status === 'done')
      .reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
    const incompleteStories = stories.filter((s) => s.status !== 'done');

    return {
      sprint,
      stories,
      report: {
        committedPoints,
        completedPoints,
        incompleteCount: incompleteStories.length,
        incompleteKeys: incompleteStories.map((s) => s.key),
      },
    };
  },

  getActive(projectId: string) {
    return sprintModel.findActive(projectId);
  },

  async create(input: CreateSprintInput) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw ErrorResponse.notFound('Project not found');
      const n = project.nextSprintNumber;
      await tx.project.update({
        where: { id: input.projectId },
        data: { nextSprintNumber: n + 1 },
      });

      const name = input.name?.trim() || `${project.key} Sprint ${n}`;

      const duplicate = await tx.sprint.findFirst({
        where: { projectId: input.projectId, name },
        select: { id: true },
      });
      if (duplicate) {
        throw ErrorResponse.conflict(`A sprint named "${name}" already exists in this project`);
      }

      // Start date is mandatory — fall back to today if caller didn't provide one.
      const startDate = input.startDate ?? new Date();

      // If endDate isn't provided, derive it from startDate plus the project's
      // default sprint length in weeks.
      let endDate = input.endDate ?? null;
      if (!endDate) {
        const computed = new Date(startDate);
        computed.setDate(computed.getDate() + project.defaultSprintLengthWeeks * 7);
        endDate = computed;
      }

      return tx.sprint.create({
        data: {
          projectId: input.projectId,
          name,
          goal: input.goal ?? null,
          startDate,
          endDate,
          status: 'planned',
          createdById: input.createdById,
        },
      });
    });
  },

  async update(
    id: string,
    data: { name?: string; goal?: string | null; startDate?: Date | null; endDate?: Date | null },
  ) {
    if (data.name !== undefined) {
      const current = await sprintModel.findById(id);
      if (!current) throw ErrorResponse.notFound('Sprint not found');
      const trimmed = data.name.trim();
      if (trimmed && trimmed !== current.name) {
        const duplicate = await prisma.sprint.findFirst({
          where: { projectId: current.projectId, name: trimmed, id: { not: id } },
          select: { id: true },
        });
        if (duplicate) {
          throw ErrorResponse.conflict(`A sprint named "${trimmed}" already exists in this project`);
        }
      }
      data = { ...data, name: trimmed };
    }
    return sprintModel.update(id, data);
  },

  /**
   * Transition a sprint to `active`. Only ONE active sprint per project — enforced
   * via a transactional check. Any backlog-status stories already on this sprint
   * flip to `todo` so the board has content in its first column.
   */
  async start(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({ where: { id } });
      if (!sprint) throw ErrorResponse.notFound('Sprint not found');
      if (sprint.status === 'active') return sprint;
      if (sprint.status === 'completed') throw ErrorResponse.badRequest('Cannot restart a completed sprint');

      const existingActive = await tx.sprint.findFirst({
        where: { projectId: sprint.projectId, status: 'active' },
      });
      if (existingActive && existingActive.id !== id) {
        throw ErrorResponse.conflict(`Sprint "${existingActive.name}" is already active`);
      }

      const started = await tx.sprint.update({
        where: { id },
        data: {
          status: 'active',
          startDate: sprint.startDate ?? new Date(),
        },
      });
      // Stories on a sprint always carry a real workflow status now, so there's
      // nothing to lift on start — the board renders them by their statusId.
      return started;
    });
  },

  /**
   * Complete the active sprint.
   * Incomplete (non-done) stories either return to the backlog (default), move
   * forward to a chosen planned sprint, or move into a brand-new sprint that is
   * auto-created on the spot (`incompleteTarget: 'new'`) — handy when no future
   * sprint has been planned yet.
   */
  async complete(
    id: string,
    input: { incompleteTarget?: 'backlog' | 'new' | string },
    actorId: string,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const sprint = await tx.sprint.findUnique({ where: { id } });
      if (!sprint) throw ErrorResponse.notFound('Sprint not found');
      if (sprint.status !== 'active') throw ErrorResponse.badRequest('Only active sprints can be completed');

      const target = input.incompleteTarget ?? 'backlog';
      let targetSprintId: string | null = null;
      let createdSprint: Awaited<ReturnType<typeof tx.sprint.create>> | null = null;
      if (target === 'new') {
        // Auto-create a fresh planned sprint to carry the incomplete stories
        // forward. Mirrors sprintService.create's naming + date defaults so an
        // auto-created sprint is indistinguishable from a hand-made one.
        const project = await tx.project.findUnique({ where: { id: sprint.projectId } });
        if (!project) throw ErrorResponse.notFound('Project not found');
        const n = project.nextSprintNumber;
        await tx.project.update({
          where: { id: sprint.projectId },
          data: { nextSprintNumber: n + 1 },
        });

        const name = `${project.key} Sprint ${n}`;
        const duplicate = await tx.sprint.findFirst({
          where: { projectId: sprint.projectId, name },
          select: { id: true },
        });
        if (duplicate) {
          throw ErrorResponse.conflict(`A sprint named "${name}" already exists in this project`);
        }

        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + project.defaultSprintLengthWeeks * 7);

        createdSprint = await tx.sprint.create({
          data: {
            projectId: sprint.projectId,
            name,
            goal: null,
            startDate,
            endDate,
            status: 'planned',
            createdById: actorId,
          },
        });
        targetSprintId = createdSprint.id;
      } else if (target !== 'backlog') {
        const nextSprint = await tx.sprint.findUnique({ where: { id: target } });
        if (!nextSprint || nextSprint.projectId !== sprint.projectId) {
          throw ErrorResponse.badRequest('Target sprint is invalid');
        }
        if (nextSprint.status !== 'planned') {
          throw ErrorResponse.badRequest('Target sprint must be in "planned" status');
        }
        targetSprintId = nextSprint.id;
      }

      const incomplete = await tx.story.findMany({
        where: { sprintId: id, status: { not: 'done' } },
        select: { id: true, status: true },
      });

      for (const s of incomplete) {
        await tx.story.update({
          where: { id: s.id },
          // Moving forward to another sprint OR back to the backlog. The backlog
          // is simply `sprintId IS NULL` now, so we only clear the sprint and
          // leave the story's status/statusId intact.
          data: targetSprintId ? { sprintId: targetSprintId } : { sprintId: null },
        });
        await tx.activityLog.create({
          data: {
            storyId: s.id,
            actorId,
            event: 'sprint_moved',
            fromValue: sprint.id,
            toValue: targetSprintId,
            // Marker: this move happened as part of sprint completion, not a
            // mid-sprint manual move. Velocity uses this to reconstruct
            // end-of-sprint scope without relying on createdAt/completedAt
            // clock comparisons.
            meta: { reason: 'sprint_completed' },
          },
        });
      }

      const completed = await tx.sprint.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
      });

      return { sprint: completed, createdSprint };
    });

    // After commit: email project members who opted into sprint-completion
    // notices. Fire-and-forget — email I/O must never block the response or run
    // inside the transaction. dispatchSprintCompleted resolves opt-ins ∩ current
    // members and dedupes + logs per recipient (at most one email per sprint).
    void (async () => {
      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      await notificationService.dispatchSprintCompleted({
        projectId: result.sprint.projectId,
        sprintId: result.sprint.id,
        sprintName: result.sprint.name,
        actorId,
        actorName: actor?.name ?? 'Someone',
      });
    })().catch((err) => logger.error('sprint-completion notifications failed', err));

    return result;
  },

  async remove(id: string) {
    const sprint = await sprintModel.findById(id);
    if (!sprint) throw ErrorResponse.notFound('Sprint not found');
    if (sprint.status === 'active') throw ErrorResponse.badRequest('Cannot delete an active sprint');
    return sprintModel.delete(id);
  },

  async moveStoryToSprint(
    storyId: string,
    nextSprintId: string | null,
    actorId: string,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const story = await tx.story.findUnique({ where: { id: storyId } });
      if (!story) throw ErrorResponse.notFound('Story not found');

      if (nextSprintId) {
        const sprint = await tx.sprint.findUnique({ where: { id: nextSprintId } });
        if (!sprint || sprint.projectId !== story.projectId) {
          throw ErrorResponse.badRequest('Target sprint not in the same project');
        }
        if (sprint.status === 'completed') {
          throw ErrorResponse.badRequest('Cannot move a story into a completed sprint');
        }
      }

      // Backlog is `sprintId IS NULL` now — moving in or out of a sprint only
      // flips sprintId. The story keeps its workflow status/statusId either way.
      const updated = await tx.story.update({
        where: { id: storyId },
        data: { sprintId: nextSprintId },
      });
      await tx.activityLog.create({
        data: {
          storyId,
          actorId,
          event: 'sprint_moved',
          fromValue: story.sprintId,
          toValue: nextSprintId,
        },
      });
      return updated;
    });

    // After commit: notify watchers. A sprint move is an "other edit", so it
    // rides the story_updated channel.
    const [storyRow, actor, nextSprint] = await Promise.all([
      prisma.story.findUnique({
        where: { id: storyId },
        select: { key: true, title: true },
      }),
      prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      nextSprintId
        ? prisma.sprint.findUnique({ where: { id: nextSprintId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    if (storyRow) {
      const dest = nextSprint ? `sprint "${nextSprint.name}"` : 'the backlog';
      await notificationService.dispatch({
        storyId,
        storyKey: storyRow.key,
        storyTitle: storyRow.title,
        actorId,
        actorName: actor?.name ?? 'Someone',
        type: 'story_updated',
        title: `${storyRow.key} moved to ${dest}`,
        body: storyRow.title,
        emailHeadline: `moved this story to ${dest}`,
      });
    }

    return result;
  },

  /**
   * Simple burndown: remaining story points per day across the sprint window.
   * A story contributes its points from its creation (or sprint start) until
   * it first hits `done` (inferred from the most recent status_changed→done log).
   */
  async burndown(id: string) {
    const sprint = await sprintModel.findById(id);
    if (!sprint) throw ErrorResponse.notFound('Sprint not found');
    const stories = await prisma.story.findMany({
      where: { sprintId: id, storyPoints: { not: null } },
      select: {
        id: true,
        storyPoints: true,
        status: true,
        activity: {
          where: { event: 'status_changed', toValue: 'done' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const start = sprint.startDate ?? sprint.createdAt;
    const end = sprint.endDate ?? new Date();
    const days: { date: string; remaining: number; ideal: number }[] = [];
    const msPerDay = 24 * 3600 * 1000;
    const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay));
    const totalPoints = stories.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);

    for (let i = 0; i <= span; i++) {
      const cursor = new Date(start.getTime() + i * msPerDay);
      const completed = stories.reduce((acc, s) => {
        const doneAt = s.activity[0]?.createdAt;
        if (doneAt && doneAt <= cursor) return acc + (s.storyPoints ?? 0);
        return acc;
      }, 0);
      days.push({
        date: cursor.toISOString().slice(0, 10),
        remaining: Math.max(0, totalPoints - completed),
        ideal: Math.max(0, totalPoints - (totalPoints * i) / span),
      });
    }
    return { totalPoints, days };
  },
};
