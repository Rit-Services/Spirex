// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Epic, EpicStatus } from '@/types/scrum';

export interface CreateEpicInput {
  projectId: string;
  title: string;
  description?: string | null;
  color?: string;
  status?: EpicStatus;
  startDate?: string | null;
  targetDate?: string | null;
}

export type UpdateEpicInput = Partial<Omit<CreateEpicInput, 'projectId'>>;

export const epicApi = {
  async list(projectId: string): Promise<Epic[]> {
    const { data } = await httpClient.get<{ epics: Epic[] }>(urls.epics.list, { params: { projectId } });
    return data.epics;
  },
  async get(id: string): Promise<Epic> {
    const { data } = await httpClient.get<{ epic: Epic }>(urls.epics.detail(id));
    return data.epic;
  },
  async create(input: CreateEpicInput): Promise<Epic> {
    const { data } = await httpClient.post<{ epic: Epic }>(urls.epics.create, input);
    return data.epic;
  },
  async update(id: string, input: UpdateEpicInput): Promise<Epic> {
    const { data } = await httpClient.patch<{ epic: Epic }>(urls.epics.detail(id), input);
    return data.epic;
  },
  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.epics.detail(id));
  },
};
