// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Comment } from '@prisma/client';

export const commentModel = {
  listByStory: (storyId: string) =>
    prisma.comment.findMany({
      where: { storyId },
      include: { author: { select: { id: true, name: true, email: true, avatarUrl: true, isExternal: true } } },
      orderBy: { createdAt: 'asc' },
    }),

  findById: (id: string) => prisma.comment.findUnique({ where: { id } }),

  create: (data: Prisma.CommentCreateInput) => prisma.comment.create({ data }),

  update: (id: string, data: Prisma.CommentUpdateInput) =>
    prisma.comment.update({ where: { id }, data }),

  delete: (id: string) => prisma.comment.delete({ where: { id } }),
};

export type { Comment };
