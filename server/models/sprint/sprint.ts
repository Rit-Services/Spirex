// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Sprint } from '@prisma/client';

export const sprintModel = {
  list: (projectId: string) =>
    prisma.sprint.findMany({
      where: { projectId },
      include: { _count: { select: { stories: true } } },
      orderBy: [{ status: 'asc' }, { startDate: 'asc' }, { createdAt: 'asc' }],
    }),

  findById: (id: string) =>
    prisma.sprint.findUnique({
      where: { id },
      include: { _count: { select: { stories: true } } },
    }),

  findActive: (projectId: string) =>
    prisma.sprint.findFirst({ where: { projectId, status: 'active' } }),

  create: (data: Prisma.SprintCreateInput) => prisma.sprint.create({ data }),

  update: (id: string, data: Prisma.SprintUpdateInput) =>
    prisma.sprint.update({ where: { id }, data }),

  delete: (id: string) => prisma.sprint.delete({ where: { id } }),
};

export type { Sprint };
