// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { userModel } from '../../models/user/user.js';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { effectiveEntitlements } from '../../utils/entitlements.js';
import { logoUrlFor } from '../../utils/logoUrl.js';
import type { User } from '@prisma/client';

const BCRYPT_ROUNDS = 10;

export const userService = {
  async authenticate(email: string, password: string) {
    const user = await userModel.findByEmail(email);
    if (!user || user.disabledAt) throw ErrorResponse.unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw ErrorResponse.unauthorized('Invalid credentials');
    return user;
  },

  signToken(user: User) {
    return jwt.sign(
      // M4: globalRole is no longer embedded — tenant role is resolved per
      // request from OrgMembership. isSuperAdmin is the only role-ish claim.
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        isSuperAdmin: user.isSuperAdmin,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] },
    );
  },

  publicProfile(user: User) {
    // M4: globalRole is not exposed to clients — they read role from the active
    // org (activeOrg.role) or, on admin lists, the per-member orgRole.
    const { passwordHash: _ph, globalRole: _gr, ...rest } = user;
    return rest;
  },

  /**
   * Resolve the active organization to hand back in auth responses (login/me).
   * Phase 2: selection-aware. When `activeOrgId` is supplied (from the per-tab
   * `X-Org-Id` header) and the user is a member of it, that org is returned;
   * otherwise we fall back to the oldest membership ("first org"). Returns null
   * for the superadmin (no membership). A stale/invalid `activeOrgId` silently
   * degrades to the first org rather than erroring — the tab just re-pins.
   */
  async resolveActiveOrg(userId: string, activeOrgId?: string) {
    const orgSelect = {
      id: true,
      name: true,
      slug: true,
      status: true,
      entitlements: true,
      maxUsers: true,
      logoPath: true,
      url: true,
    } as const;

    let membership = activeOrgId
      ? await prisma.orgMembership.findUnique({
          where: { organizationId_userId: { organizationId: activeOrgId, userId } },
          include: { organization: { select: orgSelect } },
        })
      : null;
    // No explicit selection, or the selected org isn't (or is no longer) one of
    // the user's memberships → fall back to the oldest membership.
    if (!membership) {
      membership = await prisma.orgMembership.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: { organization: { select: orgSelect } },
      });
    }
    if (!membership) return null;
    const org = membership.organization;
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      maxUsers: org.maxUsers,
      logoUrl: logoUrlFor(org.id, org.logoPath),
      url: org.url,
      // OSS: AI features are gated on env API keys, everything else is on.
      entitlements: effectiveEntitlements(),
      role: membership.role,
    };
  },

  /**
   * Lightweight list of every org the user belongs to, for the org switcher.
   * Oldest-first so it lines up with the default-org resolution above. Empty
   * for the superadmin (no memberships).
   */
  async listOrgs(userId: string) {
    const memberships = await prisma.orgMembership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, status: true, logoPath: true },
        },
      },
    });
    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      status: m.organization.status,
      logoUrl: logoUrlFor(m.organization.id, m.organization.logoPath),
      role: m.role,
    }));
  },

  /** Update a user's display name. Shared by self-service and admin edits. */
  async updateName(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw ErrorResponse.badRequest('Name cannot be empty');
    const target = await userModel.findById(id);
    if (!target) throw ErrorResponse.notFound('User not found');
    return userModel.update(id, { name: trimmed });
  },

  async disableUser(id: string) {
    return userModel.update(id, { disabledAt: new Date() });
  },


  async enableUser(id: string) {
    return userModel.update(id, { disabledAt: null });
  },

  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    await userModel.update(id, { passwordHash });
    return { tempPassword };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userModel.findById(userId);
    if (!user || user.disabledAt) throw ErrorResponse.unauthorized('User not found');

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) throw ErrorResponse.badRequest('Current password is incorrect');

    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await userModel.update(userId, { passwordHash: newPasswordHash });

    return { message: 'Password changed successfully' };
  },

  listAll() {
    return userModel.list();
  },

  async getDetail(id: string, organizationId?: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            project: { select: { id: true, key: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) return null;
    const { passwordHash: _ph, globalRole: _gr, memberships, ...publicUser } = user;
    // Phase 2: the member's role IN THIS org (so the admin detail view shows the
    // right role for a multi-org user, not the legacy global mirror).
    const orgRole =
      (organizationId
        ? (await prisma.orgMembership.findUnique({
            where: { organizationId_userId: { organizationId, userId: id } },
            select: { role: true },
          }))?.role
        : undefined) ?? 'member';
    return {
      user: { ...publicUser, orgRole },
      projects: memberships.map((m) => ({
        membershipId: m.id,
        projectId: m.project.id,
        projectKey: m.project.key,
        projectName: m.project.name,
        projectRole: m.projectRole,
        joinedAt: m.createdAt.toISOString(),
      })),
    };
  },
};
