// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Worklog } from '@/types/scrum';

export const worklogApi = {
  async listByStory(storyId: string): Promise<{ worklogs: Worklog[]; totalMinutes: number }> {
    const { data } = await httpClient.get<{ worklogs: Worklog[]; totalMinutes: number }>(
      urls.worklogs.byStory(storyId),
    );
    return data;
  },
  async create(input: {
    storyId: string;
    timeSpent: string;
    startedAt?: string;
    description?: string | null;
  }): Promise<Worklog> {
    const { data } = await httpClient.post<{ worklog: Worklog }>(urls.worklogs.create, input);
    return data.worklog;
  },
  async update(
    id: string,
    input: { timeSpent?: string; startedAt?: string; description?: string | null },
  ): Promise<Worklog> {
    const { data } = await httpClient.patch<{ worklog: Worklog }>(urls.worklogs.detail(id), input);
    return data.worklog;
  },
  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.worklogs.detail(id));
  },
};
