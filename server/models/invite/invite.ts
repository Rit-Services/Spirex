// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Invite } from '@prisma/client';

export const inviteModel = {
  create: (data: Prisma.InviteUncheckedCreateInput) => prisma.invite.create({ data }),
  findByTokenHash: (tokenHash: string) =>
    prisma.invite.findUnique({
      where: { tokenHash },
      include: { user: true, organization: true },
    }),
  findById: (id: string) =>
    prisma.invite.findUnique({
      where: { id },
      include: { user: true, organization: true },
    }),
  /** A user's live (unconsumed, unexpired) org invitations — for the in-app list. */
  listPendingForUser: (userId: string, now: Date) =>
    prisma.invite.findMany({
      where: {
        userId,
        consumedAt: null,
        expiresAt: { gt: now },
        organizationId: { not: null },
      },
      include: { organization: true },
      orderBy: { createdAt: 'desc' },
    }),
  /**
   * An org's unconsumed invitations — for the ADMIN-side view, so an admin can
   * see who hasn't accepted yet. Deliberately includes EXPIRED-but-unaccepted
   * invites (no expiresAt filter): those are exactly the ones worth resending.
   * Includes the invitee (name/email) since no membership exists until accept.
   */
  listPendingForOrg: (organizationId: string) =>
    prisma.invite.findMany({
      where: {
        organizationId,
        consumedAt: null,
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    }),
  consume: (id: string) =>
    prisma.invite.update({ where: { id }, data: { consumedAt: new Date() } }),
  invalidateForUser: (userId: string) =>
    prisma.invite.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
};

export type { Invite };
