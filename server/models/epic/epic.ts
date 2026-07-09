// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Epic } from '@prisma/client';

export const epicModel = {
  list: (projectId: string) =>
    prisma.epic.findMany({
      where: { projectId },
      include: { _count: { select: { stories: true } } },
      orderBy: { createdAt: 'asc' },
    }),

  findById: (id: string) =>
    prisma.epic.findUnique({
      where: { id },
      include: {
        stories: { orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { stories: true } },
      },
    }),

  create: (data: Prisma.EpicCreateInput) => prisma.epic.create({ data }),

  update: (id: string, data: Prisma.EpicUpdateInput) =>
    prisma.epic.update({ where: { id }, data }),

  delete: (id: string) => prisma.epic.delete({ where: { id } }),
};

export type { Epic };
