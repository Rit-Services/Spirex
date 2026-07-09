// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { Prisma, Project, ProjectMember } from '@prisma/client';

export const projectModel = {
  findById: (id: string) =>
    prisma.project.findUnique({
      where: { id },
      include: { members: { include: { user: true } }, createdBy: true },
    }),

  findByKey: (key: string) => prisma.project.findUnique({ where: { key } }),

  // Projects in ONE org that the user is a member of. Org-scoped so a user who
  // belongs to multiple orgs only ever sees the active org's projects (Phase 2).
  listForUser: (userId: string, organizationId: string) =>
    prisma.project.findMany({
      where: { organizationId, members: { some: { userId } } },
      include: {
        members: { include: { user: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

  listAll: () =>
    prisma.project.findMany({
      include: { members: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    }),

  // Phase 13: all projects within one organization — the org-admin view, scoped
  // so an admin never sees another tenant's projects.
  listForOrg: (organizationId: string) =>
    prisma.project.findMany({
      where: { organizationId },
      include: {
        members: { include: { user: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),

  create: (data: Prisma.ProjectCreateInput) => prisma.project.create({ data }),

  update: (id: string, data: Prisma.ProjectUpdateInput) =>
    prisma.project.update({ where: { id }, data }),

  delete: (id: string) => prisma.project.delete({ where: { id } }),
};

export const projectMemberModel = {
  list: (projectId: string) =>
    prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    }),

  findForUser: (projectId: string, userId: string) =>
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    }),

  upsert: (data: {
    projectId: string;
    userId: string;
    projectRole: 'lead' | 'developer' | 'reporter' | 'viewer';
  }) =>
    prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: data.projectId, userId: data.userId } },
      update: { projectRole: data.projectRole },
      create: data,
      include: { user: true },
    }),

  remove: (projectId: string, userId: string) =>
    prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    }),
};

export type { Project, ProjectMember };
