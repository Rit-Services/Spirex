// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Attachment } from '@prisma/client';

export const attachmentModel = {
  findById: (id: string) =>
    prisma.attachment.findUnique({
      where: { id },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }),

  listByStory: (storyId: string) =>
    prisma.attachment.findMany({
      where: { storyId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

  listByProject: (projectId: string) =>
    prisma.attachment.findMany({
      where: { projectId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),

  create: (data: Prisma.AttachmentCreateInput) => prisma.attachment.create({ data }),

  delete: (id: string) => prisma.attachment.delete({ where: { id } }),
};

export type { Attachment };
