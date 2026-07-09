// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';

export const orgMembershipModel = {
  // Memberships for a user, with the org id/slug/status needed to build
  // req.orgContext. Ordered oldest-first so "first membership" is stable.
  listForUser: (userId: string) =>
    prisma.orgMembership.findMany({
      where: { userId },
      include: {
        // entitlements travel with the membership so requireEntitlement can read
        // them straight off req.orgContext without an extra query per request.
        organization: { select: { id: true, slug: true, status: true, entitlements: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

  findForUserInOrg: (userId: string, organizationId: string) =>
    prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    }),
};
