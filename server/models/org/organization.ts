// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma } from '@prisma/client';

// Seat usage = count(OrgMembership); projectCount = count(Project). Both come
// back via _count so the superadmin list/detail can show "used/max" without an
// extra query per org.
const usageCount = {
  _count: { select: { memberships: true, projects: true } },
} satisfies Prisma.OrganizationInclude;

export const organizationModel = {
  listWithUsage: () =>
    prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
      include: usageCount,
    }),

  // Superadmin command-bar lookup: match on name or slug, case-insensitive.
  search: (q: string, limit: number) =>
    prisma.organization.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: limit,
      include: usageCount,
    }),

  findById: (id: string) =>
    prisma.organization.findUnique({
      where: { id },
      include: usageCount,
    }),

  findBySlug: (slug: string) =>
    prisma.organization.findUnique({ where: { slug } }),

  count: () => prisma.organization.count(),

  create: (data: Prisma.OrganizationCreateInput) =>
    prisma.organization.create({ data, include: usageCount }),

  update: (id: string, data: Prisma.OrganizationUpdateInput) =>
    prisma.organization.update({ where: { id }, data, include: usageCount }),
};
