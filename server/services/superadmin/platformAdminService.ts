// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma.js';
import { userModel } from '../../models/user/user.js';
import { userService } from '../user/userService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

const BCRYPT_ROUNDS = 10;

// Platform superadmins — pure operators, above every org (no membership, no
// seat). Managed only by an existing superadmin.
export const platformAdminService = {
  async list() {
    const users = await prisma.user.findMany({
      where: { isSuperAdmin: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(userService.publicProfile);
  },

  async create(input: { name: string; email: string; password: string }) {
    const existing = await userModel.findByEmail(input.email);
    if (existing) throw ErrorResponse.conflict('A user with that email already exists');
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    // No org membership — a superadmin is a platform operator, not a tenant user.
    return userModel.create({
      name: input.name,
      email: input.email,
      passwordHash,
      isSuperAdmin: true,
    });
  },

  async revoke(userId: string) {
    // Never remove the last superadmin — the platform would be unmanageable.
    const count = await prisma.user.count({ where: { isSuperAdmin: true } });
    if (count <= 1) throw ErrorResponse.badRequest('At least one superadmin is required');
    const user = await userModel.findById(userId);
    if (!user || !user.isSuperAdmin) throw ErrorResponse.notFound('Superadmin not found');
    return userModel.update(userId, { isSuperAdmin: false });
  },
};
