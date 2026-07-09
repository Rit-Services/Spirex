// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { notificationService } from '../../services/notification/notificationService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import type { ListNotificationsQuery } from '../../validators/notificationValidator.js';

export const notificationController = {
  // Bare GET = the bell's old behavior (newest 40). With query params it pages
  // and filters for the full /notifications view. `unread` in the response is
  // ALWAYS the user's total unread count, not the filtered count — it feeds
  // the badge, which must not change when the list is narrowed.
  async list(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const query = req.query as unknown as ListNotificationsQuery;
    const { notifications, nextCursor } = await notificationService.listByUser(req.user.id, {
      cursor: query.cursor,
      limit: query.limit,
      unreadOnly: query.unread,
      type: query.type,
      q: query.q,
    });
    const unread = await notificationService.countUnread(req.user.id);
    res.json({ notifications, unread, nextCursor });
  },

  async unreadCount(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const unread = await notificationService.countUnread(req.user.id);
    res.json({ unread });
  },

  async markRead(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    await notificationService.markRead(req.params.id, req.user.id);
    res.status(204).end();
  },

  async markAllRead(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    await notificationService.markAllRead(req.user.id);
    res.status(204).end();
  },

  async getPreferences(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const preferences = await notificationService.getPreferences(req.user.id);
    res.json({ preferences });
  },

  async updatePreferences(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const preferences = await notificationService.setPreferences(
      req.user.id,
      req.body.preferences,
    );
    res.json({ preferences });
  },
};
