// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { userModel } from '../../models/user/user.js';
import { userService } from '../user/userService.js';
import type { GlobalRole, Prisma } from '@prisma/client';

const BCRYPT_ROUNDS = 10;
// An org must always retain at least one admin so it can never become
// unmanageable. (The platform superadmin can still fix an org from above.)
const MIN_ADMINS_PER_ORG = 1;

/**
 * Seat guard, run inside a transaction so the count → insert is atomic and two
 * concurrent adds can't both slip past a full org. Throws if the org is at cap.
 * Exported so the invite-accept path enforces the exact same rule at accept time.
 */
export async function assertSeatAvailable(tx: Prisma.TransactionClient, organizationId: string) {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { maxUsers: true },
  });
  if (!org) throw ErrorResponse.notFound('Organization not found');
  const used = await tx.orgMembership.count({ where: { organizationId } });
  if (used >= org.maxUsers) {
    throw ErrorResponse.badRequest(
      `Seat limit reached (${used}/${org.maxUsers}). Increase the limit or remove a member first.`,
    );
  }
}

/**
 * Org-scoped membership operations.
 *
 * M4: OrgMembership.role is the single source of truth for a user's role in an
 * org. The legacy User.globalRole is no longer written or read (the column
 * remains, vestigial, until the M4b drop migration).
 */
export const orgMemberService = {
  async listForOrg(organizationId: string) {
    const memberships = await prisma.orgMembership.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      ...userService.publicProfile(m.user),
      orgRole: m.role,
      membershipId: m.id,
      joinedAt: m.createdAt.toISOString(),
    }));
  },

  /**
   * Platform-wide member lookup for the superadmin command bar. Matches users by
   * name or email ACROSS every org, and carries the owning org on each hit so the
   * UI can jump straight to that org's detail page.
   */
  async search(q: string, limit: number) {
    const memberships = await prisma.orgMembership.findMany({
      where: {
        user: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        user: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { user: { name: 'asc' } },
      take: limit,
    });
    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      orgRole: m.role,
      organization: m.organization,
    }));
  },

  getMembership(organizationId: string, userId: string) {
    return prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  },

  /**
   * Create a brand-new user and their membership in this org. Seat-checked and
   * atomic. Rejects an existing email — linking an existing account across orgs
   * is Phase 2; in Phase 1 every user belongs to exactly one org.
   */
  async createMember(
    organizationId: string,
    input: {
      name: string;
      email: string;
      role: GlobalRole;
      mode: 'password' | 'invite';
      password?: string;
    },
  ) {
    const existing = await userModel.findByEmail(input.email);
    if (existing) throw ErrorResponse.conflict('A user with that email already exists');

    let passwordHash: string;
    if (input.mode === 'invite') {
      // Unguessable placeholder — the user sets a real password via the invite.
      passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), BCRYPT_ROUNDS);
    } else {
      if (!input.password) throw ErrorResponse.badRequest('Password is required');
      passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    }

    return prisma.$transaction(async (tx) => {
      await assertSeatAvailable(tx, organizationId);
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          // M4: no globalRole write — role lives on OrgMembership below.
          avatarUrl: null,
        },
      });
      await tx.orgMembership.create({
        data: { organizationId, userId: user.id, role: input.role },
      });
      return user;
    });
  },

  /** Change a member's role in this org (OrgMembership.role is the sole authority). */
  async setRole(organizationId: string, userId: string, role: GlobalRole) {
    return prisma.$transaction(async (tx) => {
      const membership = await tx.orgMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (!membership) throw ErrorResponse.notFound('Member not found in this organization');

      // Block demoting the org's last admin.
      if (membership.role === 'admin' && role !== 'admin') {
        const admins = await tx.orgMembership.count({
          where: { organizationId, role: 'admin' },
        });
        if (admins <= MIN_ADMINS_PER_ORG) {
          throw ErrorResponse.badRequest(
            'An organization must keep at least one admin — promote another member first',
          );
        }
      }

      // M4: OrgMembership.role is the sole authority — no globalRole mirror.
      await tx.orgMembership.update({
        where: { organizationId_userId: { organizationId, userId } },
        data: { role },
      });
      return tx.user.findUniqueOrThrow({ where: { id: userId } });
    });
  },

  /** Remove a member from the org, freeing a seat. The user row is kept. */
  async removeMember(organizationId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const membership = await tx.orgMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
      });
      if (!membership) throw ErrorResponse.notFound('Member not found in this organization');

      if (membership.role === 'admin') {
        const admins = await tx.orgMembership.count({
          where: { organizationId, role: 'admin' },
        });
        if (admins <= MIN_ADMINS_PER_ORG) {
          throw ErrorResponse.badRequest('Cannot remove the last admin of an organization');
        }
      }

      await tx.orgMembership.delete({
        where: { organizationId_userId: { organizationId, userId } },
      });
    });
  },
};
