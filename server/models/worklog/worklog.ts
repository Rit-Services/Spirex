// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Worklog } from '@prisma/client';

export const worklogModel = {
  listByStory: (storyId: string) =>
    prisma.worklog.findMany({
      where: { storyId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      // Oldest-first, so the time-tracking list reads top-to-bottom in the same
      // chronological direction as comments + activity. No limit here, so a plain
      // ascending sort is correct (no newest-window to preserve).
      orderBy: { startedAt: 'asc' },
    }),

  sumForStory: async (storyId: string) => {
    const agg = await prisma.worklog.aggregate({
      where: { storyId },
      _sum: { timeSpentMinutes: true },
    });
    return agg._sum.timeSpentMinutes ?? 0;
  },

  findById: (id: string) => prisma.worklog.findUnique({ where: { id } }),

  create: (data: Prisma.WorklogCreateInput) => prisma.worklog.create({ data }),

  update: (id: string, data: Prisma.WorklogUpdateInput) =>
    prisma.worklog.update({ where: { id }, data }),

  delete: (id: string) => prisma.worklog.delete({ where: { id } }),
};

export type { Worklog };
