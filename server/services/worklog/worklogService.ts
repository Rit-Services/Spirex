// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { worklogModel } from '../../models/worklog/worklog.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { activityService } from '../activity/activityService.js';

export const worklogService = {
  listByStory: (storyId: string) => worklogModel.listByStory(storyId),
  sumForStory: (storyId: string) => worklogModel.sumForStory(storyId),

  async create(input: {
    storyId: string;
    userId: string;
    timeSpentMinutes: number;
    startedAt: Date;
    description?: string | null;
  }) {
    if (input.timeSpentMinutes <= 0) {
      throw ErrorResponse.badRequest('timeSpentMinutes must be greater than zero');
    }
    const rec = await prisma.worklog.create({
      data: {
        storyId: input.storyId,
        userId: input.userId,
        timeSpentMinutes: input.timeSpentMinutes,
        startedAt: input.startedAt,
        description: input.description ?? null,
      },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    await activityService.log({
      storyId: input.storyId,
      actorId: input.userId,
      event: 'worklogged',
      toValue: String(input.timeSpentMinutes),
    });
    return rec;
  },

  async update(
    id: string,
    userId: string,
    data: { timeSpentMinutes?: number; startedAt?: Date; description?: string | null },
  ) {
    const existing = await worklogModel.findById(id);
    if (!existing) throw ErrorResponse.notFound('Worklog not found');
    if (existing.userId !== userId) throw ErrorResponse.forbidden('Only the author can edit a worklog');
    if (data.timeSpentMinutes !== undefined && data.timeSpentMinutes <= 0) {
      throw ErrorResponse.badRequest('timeSpentMinutes must be greater than zero');
    }
    return prisma.worklog.update({
      where: { id },
      data,
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
  },

  async remove(id: string, userId: string, isAdmin: boolean) {
    const existing = await worklogModel.findById(id);
    if (!existing) throw ErrorResponse.notFound('Worklog not found');
    if (!isAdmin && existing.userId !== userId) {
      throw ErrorResponse.forbidden('Only the author can delete their worklog');
    }
    const deleted = await worklogModel.delete(id);
    await activityService.log({
      storyId: existing.storyId,
      actorId: userId,
      event: 'worklog_deleted',
      toValue: String(existing.timeSpentMinutes),
    });
    return deleted;
  },
};
