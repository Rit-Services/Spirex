// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, UserApiKey } from '@prisma/client';

export const apiKeyModel = {
  findByPrefix: (prefix: string) =>
    prisma.userApiKey.findUnique({ where: { prefix } }),

  findByIdForUser: (id: string, userId: string) =>
    prisma.userApiKey.findFirst({ where: { id, userId } }),

  listByUser: (userId: string) =>
    prisma.userApiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),

  create: (data: Prisma.UserApiKeyUncheckedCreateInput) =>
    prisma.userApiKey.create({ data }),

  revoke: (id: string) =>
    prisma.userApiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    }),

  touchLastUsed: (id: string) =>
    prisma.userApiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    }),
};

export type { UserApiKey };
