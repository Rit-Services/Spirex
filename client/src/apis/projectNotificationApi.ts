// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';

export type ProjectNotificationEvent =
  | 'status_changed'
  | 'ticket_completed'
  | 'sprint_completed';

export interface ProjectNotifPref {
  userId: string;
  event: ProjectNotificationEvent;
  emailEnabled: boolean;
}

export const projectNotificationApi = {
  async list(
    projectId: string,
  ): Promise<{ preferences: ProjectNotifPref[]; canManageAll: boolean }> {
    const { data } = await httpClient.get<{
      preferences: ProjectNotifPref[];
      canManageAll: boolean;
    }>(urls.projectNotifications.byProject(projectId));
    return { preferences: data.preferences, canManageAll: data.canManageAll };
  },

  async setForUser(
    projectId: string,
    userId: string,
    entries: { event: ProjectNotificationEvent; emailEnabled: boolean }[],
  ): Promise<ProjectNotifPref[]> {
    const { data } = await httpClient.put<{ preferences: ProjectNotifPref[] }>(
      urls.projectNotifications.setForUser(projectId, userId),
      { entries },
    );
    return data.preferences;
  },
};
