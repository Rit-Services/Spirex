// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { BurndownResponse, Sprint, Story } from '@/types/scrum';

export interface SprintDetailResponse {
  sprint: Sprint;
  stories: Story[];
  report: {
    committedPoints: number;
    completedPoints: number;
    incompleteCount: number;
    incompleteKeys: string[];
  };
}

export interface CreateSprintInput {
  projectId: string;
  name?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdateSprintInput {
  name?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export const sprintApi = {
  async list(projectId: string): Promise<Sprint[]> {
    const { data } = await httpClient.get<{ sprints: Sprint[] }>(urls.sprints.list, { params: { projectId } });
    return data.sprints;
  },
  async create(input: CreateSprintInput): Promise<Sprint> {
    const { data } = await httpClient.post<{ sprint: Sprint }>(urls.sprints.create, input);
    return data.sprint;
  },
  async update(id: string, input: UpdateSprintInput): Promise<Sprint> {
    const { data } = await httpClient.patch<{ sprint: Sprint }>(urls.sprints.detail(id), input);
    return data.sprint;
  },
  async start(id: string): Promise<Sprint> {
    const { data } = await httpClient.post<{ sprint: Sprint }>(urls.sprints.start(id));
    return data.sprint;
  },
  async complete(
    id: string,
    input: { incompleteTarget?: string },
  ): Promise<{ sprint: Sprint; createdSprint: Sprint | null }> {
    const { data } = await httpClient.post<{ sprint: Sprint; createdSprint: Sprint | null }>(
      urls.sprints.complete(id),
      input,
    );
    return { sprint: data.sprint, createdSprint: data.createdSprint ?? null };
  },
  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.sprints.detail(id));
  },
  async burndown(id: string): Promise<BurndownResponse> {
    const { data } = await httpClient.get<BurndownResponse>(urls.sprints.burndown(id));
    return data;
  },
  async getDetail(id: string): Promise<SprintDetailResponse> {
    const { data } = await httpClient.get<SprintDetailResponse>(
      `${urls.sprints.detail(id)}/detail`,
    );
    return data;
  },
};
