// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { NotificationType, Prisma } from '@prisma/client';

export interface CreateNotificationInput {
  userId: string;
  // Phase 2: org this notification belongs to (drives the bell's per-org
  // filter and the cross-org switch-on-click). Optional — legacy/system rows
  // may omit it and are treated as "all orgs".
  organizationId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  storyId?: string;
  storyKey?: string;
}

export interface NotificationListFilters {
  /** Notification id to continue AFTER (exclusive) — newest-first pages. */
  cursor?: string;
  limit?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
  /** Case-insensitive match against title, body, or story key. */
  q?: string;
}

export const notificationModel = {
  create: (data: CreateNotificationInput) =>
    prisma.notification.create({ data }),

  // Join through the story FK to surface the project id, so the client can
  // deep-link straight to the full-page ticket route (/projects/:id/stories/:key)
  // instead of the drawer. `story` is nullable (the row may outlive its story),
  // so projectId falls back to null and the client degrades to the drawer.
  //
  // Filters + cursor power the full /notifications page; the bell calls this
  // bare and gets the old behavior exactly (newest 40, no paging).
  listByUser: async (userId: string, filters: NotificationListFilters = {}) => {
    const limit = Math.min(Math.max(filters.limit ?? 40, 1), 100);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(filters.unreadOnly ? { read: false } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: 'insensitive' } },
              { body: { contains: filters.q, mode: 'insensitive' } },
              { storyKey: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await prisma.notification.findMany({
      where,
      // id as the tiebreak so the cursor is unambiguous when rows share a
      // createdAt (watcher fan-outs write batches in the same millisecond).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // Fetch one extra row to learn whether another page exists — no COUNT.
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: { story: { select: { projectId: true } } },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      notifications: page.map(({ story, ...n }) => ({
        ...n,
        projectId: story?.projectId ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  },

  countUnread: (userId: string) =>
    prisma.notification.count({ where: { userId, read: false } }),

  markRead: (id: string, userId: string) =>
    prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    }),

  markAllRead: (userId: string) =>
    prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    }),
};
