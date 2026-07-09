// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { epicModel } from '../../models/epic/epic.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import type { EpicStatus } from '@prisma/client';

export const epicService = {
  list(projectId: string) {
    return epicModel.list(projectId);
  },

  async get(id: string) {
    const epic = await epicModel.findById(id);
    if (!epic) throw ErrorResponse.notFound('Epic not found');
    return epic;
  },

  async create(input: {
    projectId: string;
    title: string;
    description?: string | null;
    color?: string;
    status?: EpicStatus;
    startDate?: Date | null;
    targetDate?: Date | null;
    createdById: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw ErrorResponse.notFound('Project not found');
      const n = project.nextEpicNumber;
      await tx.project.update({
        where: { id: input.projectId },
        data: { nextEpicNumber: n + 1 },
      });
      return tx.epic.create({
        data: {
          projectId: input.projectId,
          key: `${project.key}-E${n}`,
          title: input.title,
          description: input.description ?? null,
          color: input.color ?? '#0052CC',
          status: input.status ?? 'open',
          startDate: input.startDate ?? null,
          targetDate: input.targetDate ?? null,
          createdById: input.createdById,
        },
      });
    });
  },

  async update(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      color?: string;
      status?: EpicStatus;
      startDate?: Date | null;
      targetDate?: Date | null;
    },
  ) {
    return epicModel.update(id, data);
  },

  async remove(id: string) {
    return epicModel.delete(id);
  },
};
