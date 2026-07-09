// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { ActivityEvent, Prisma } from '@prisma/client';

/**
 * Write-only in Phase 3 — UI feed lands in Phase 5.
 * Phase 4 will call this from the sprint-move endpoint as well.
 */
export const activityService = {
  async log(input: {
    storyId: string;
    actorId: string;
    event: ActivityEvent;
    fromValue?: string | null;
    toValue?: string | null;
    meta?: Prisma.InputJsonValue;
  }) {
    return prisma.activityLog.create({
      data: {
        storyId: input.storyId,
        actorId: input.actorId,
        event: input.event,
        fromValue: input.fromValue ?? null,
        toValue: input.toValue ?? null,
        meta: input.meta,
      },
    });
  },

  async listByStory(storyId: string, take = 100) {
    // Fetch the most recent `take` events (desc + take), THEN reverse to present
    // them oldest-first. Querying ascending directly would take the OLDEST 100
    // and drop the latest activity on long-lived stories — the cap must stay on
    // the newest end. The reversed result reads top-to-bottom chronologically,
    // consistent with comments + time tracking.
    const rows = await prisma.activityLog.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { actor: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    const ordered = rows.reverse();

    // Resolve status_changed transitions to the CURRENT workflow column names,
    // so renaming a column (e.g. "QA" → "SvenTesting") updates the WHOLE history
    // — old and new entries alike — instead of showing a stale label snapshot.
    if (!ordered.some((r) => r.event === 'status_changed')) return ordered;

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { projectId: true },
    });
    const wf = story
      ? await prisma.workflowStatus.findMany({ where: { projectId: story.projectId } })
      : [];
    const labelById = new Map(wf.map((w) => [w.id, w.label]));
    // Fallback for entries with no row id (created before this change): map the
    // stored core-status enum to that core's DEFAULT column label.
    const labelByCore = new Map<string, string>();
    for (const w of wf) {
      if (w.isDefault || !labelByCore.has(w.coreStatus)) labelByCore.set(w.coreStatus, w.label);
    }
    const resolve = (statusId: unknown, coreValue: string | null): string | null => {
      if (typeof statusId === 'string' && labelById.has(statusId)) return labelById.get(statusId)!;
      if (coreValue && labelByCore.has(coreValue)) return labelByCore.get(coreValue)!;
      return coreValue ? coreValue.replace(/_/g, ' ') : null;
    };

    return ordered.map((r) => {
      if (r.event !== 'status_changed') return r;
      const meta = (r.meta ?? {}) as { fromStatusId?: unknown; toStatusId?: unknown };
      return {
        ...r,
        fromLabel: resolve(meta.fromStatusId, r.fromValue),
        toLabel: resolve(meta.toStatusId, r.toValue),
      };
    });
  },
};
