// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Label } from '@/types/scrum';

export interface CreateLabelInput {
  name: string;
  /** Omit to let the server auto-assign the next palette color. */
  color?: string;
}

export interface UpdateLabelInput {
  name?: string;
  color?: string;
}

export const labelApi = {
  async listByProject(projectId: string): Promise<Label[]> {
    const { data } = await httpClient.get<{ labels: Label[] }>(urls.labels.byProject(projectId));
    return data.labels;
  },

  async create(projectId: string, input: CreateLabelInput): Promise<Label> {
    const { data } = await httpClient.post<{ label: Label }>(urls.labels.create(projectId), input);
    return data.label;
  },

  async update(id: string, input: UpdateLabelInput): Promise<Label> {
    const { data } = await httpClient.patch<{ label: Label }>(urls.labels.update(id), input);
    return data.label;
  },

  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.labels.remove(id));
  },
};
