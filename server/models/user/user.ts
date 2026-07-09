// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, User } from '@prisma/client';

export const userModel = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),
  findById: (id: string) => prisma.user.findUnique({ where: { id } }),
  list: (where: Prisma.UserWhereInput = {}) =>
    prisma.user.findMany({ where, orderBy: { createdAt: 'asc' } }),
  create: (data: Prisma.UserCreateInput) => prisma.user.create({ data }),
  update: (id: string, data: Prisma.UserUpdateInput) =>
    prisma.user.update({ where: { id }, data }),
  delete: (id: string) => prisma.user.delete({ where: { id } }),
};

export type { User };
