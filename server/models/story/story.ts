// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Story, StoryStatus } from '@prisma/client';

// Hydrate the story↔label join, then flatten so the API surfaces a plain
// `labels: {id,name,color}[]` array (mirrors the epic subset) instead of the
// nested join rows. Keeps the frontend shape identical to how epics render.
const labelInclude = {
  labels: {
    include: { label: { select: { id: true, name: true, color: true } } },
  },
} satisfies Prisma.StoryInclude;

function flattenLabels<T extends { labels: { label: { id: string; name: string; color: string } }[] }>(
  row: T,
): Omit<T, 'labels'> & { labels: { id: string; name: string; color: string }[] } {
  const labels = row.labels.map((l) => l.label).sort((a, b) => a.name.localeCompare(b.name));
  return { ...row, labels };
}

export const storyModel = {
  list: async (where: Prisma.StoryWhereInput, take = 200) => {
    const rows = await prisma.story.findMany({
      where,
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
        reporter: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
        epic: { select: { id: true, key: true, title: true, color: true } },
        ...labelInclude,
        // Counts only (no rows) so list surfaces — backlog + board — can show a
        // "has child issues" indicator without hydrating the full subtask list.
        _count: { select: { subtasks: true, outgoingLinks: true, attachments: true } },
      },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
      take,
    });
    return rows.map(flattenLabels);
  },

  // Issues assigned to one user across every project in an org — the dashboard
  // "My issues" widget. Lean select (no labels/counts) since the widget only
  // renders key/title/status/priority + the project chip. Ordered by recency in
  // the DB; the status-priority ordering is applied in the service so it stays
  // configurable. `take` caps a single user's open assigned work defensively.
  assignedToMe: (
    params: { userId: string; organizationId: string; statuses: StoryStatus[] },
    take = 500,
  ) =>
    prisma.story.findMany({
      where: {
        assigneeId: params.userId,
        status: { in: params.statuses },
        project: { organizationId: params.organizationId },
      },
      select: {
        id: true,
        key: true,
        title: true,
        status: true,
        statusId: true,
        type: true,
        priority: true,
        updatedAt: true,
        projectId: true,
        project: { select: { id: true, key: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    }),

  findById: async (id: string) => {
    const row = await prisma.story.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
        reporter: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
        epic: { select: { id: true, key: true, title: true, color: true } },
        ...labelInclude,
        parent: { select: { id: true, key: true, title: true } },
        subtasks: {
          select: {
            id: true,
            key: true,
            title: true,
            status: true,
            statusId: true,
            type: true,
            priority: true,
            assigneeId: true,
            assignee: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        _count: { select: { subtasks: true, outgoingLinks: true, attachments: true } },
        customFieldValues: {
          include: { field: true },
          orderBy: { field: { order: 'asc' } },
        },
      },
    });
    return row ? flattenLabels(row) : row;
  },

  findByKey: async (key: string) => {
    const row = await prisma.story.findUnique({
      where: { key },
      include: {
        assignee: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
        reporter: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } },
        epic: { select: { id: true, key: true, title: true, color: true } },
        ...labelInclude,
      },
    });
    return row ? flattenLabels(row) : row;
  },

  create: (data: Prisma.StoryCreateInput) => prisma.story.create({ data }),

  update: (id: string, data: Prisma.StoryUncheckedUpdateInput) =>
    prisma.story.update({ where: { id }, data }),

  delete: (id: string) => prisma.story.delete({ where: { id } }),
};

export type { Story };
