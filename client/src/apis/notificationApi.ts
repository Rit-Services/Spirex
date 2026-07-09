// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { AppNotification, NotificationPreference, NotificationType } from '@/types/scrum';

export interface NotificationListParams {
  /** Notification id to continue AFTER — pass the previous page's nextCursor. */
  cursor?: string;
  limit?: number;
  /** Only unread rows. */
  unread?: boolean;
  type?: NotificationType;
  /** Case-insensitive match against title, body, or story key. */
  q?: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  /** TOTAL unread for the user (badge), regardless of the filters applied. */
  unread: number;
  /** Cursor for the next page; null when this page is the last. */
  nextCursor: string | null;
}

export const notificationApi = {
  /** Bare call = the bell's feed (newest 40). With params it pages + filters. */
  async list(params?: NotificationListParams): Promise<NotificationListResponse> {
    const { data } = await httpClient.get<NotificationListResponse>(urls.notifications.list, {
      params: params
        ? {
            cursor: params.cursor,
            limit: params.limit,
            // The server only treats the literal 'true' as opt-in.
            unread: params.unread ? 'true' : undefined,
            type: params.type,
            q: params.q?.trim() || undefined,
          }
        : undefined,
    });
    return data;
  },

  async unreadCount(): Promise<number> {
    const { data } = await httpClient.get<{ unread: number }>(urls.notifications.unreadCount);
    return data.unread;
  },

  async markRead(id: string): Promise<void> {
    await httpClient.patch(urls.notifications.markRead(id));
  },

  async markAllRead(): Promise<void> {
    await httpClient.patch(urls.notifications.markAllRead);
  },

  async getPreferences(): Promise<NotificationPreference[]> {
    const { data } = await httpClient.get<{ preferences: NotificationPreference[] }>(
      urls.notifications.preferences,
    );
    return data.preferences;
  },

  async updatePreferences(
    preferences: NotificationPreference[],
  ): Promise<NotificationPreference[]> {
    const { data } = await httpClient.put<{ preferences: NotificationPreference[] }>(
      urls.notifications.preferences,
      { preferences },
    );
    return data.preferences;
  },
};
