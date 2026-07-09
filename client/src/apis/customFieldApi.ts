// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { CustomFieldDefinition, CustomFieldType } from '@/types/scrum';

export interface CreateCustomFieldInput {
  name: string;
  type: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
}

export interface UpdateCustomFieldInput {
  name?: string;
  options?: string[];
  isRequired?: boolean;
  order?: number;
}

export const customFieldApi = {
  async list(projectId: string): Promise<CustomFieldDefinition[]> {
    const { data } = await httpClient.get<{ fields: CustomFieldDefinition[] }>(
      urls.customFields.byProject(projectId),
    );
    return data.fields;
  },
  async create(projectId: string, input: CreateCustomFieldInput): Promise<CustomFieldDefinition> {
    const { data } = await httpClient.post<{ field: CustomFieldDefinition }>(
      urls.customFields.byProject(projectId),
      input,
    );
    return data.field;
  },
  async update(id: string, input: UpdateCustomFieldInput): Promise<CustomFieldDefinition> {
    const { data } = await httpClient.patch<{ field: CustomFieldDefinition }>(
      urls.customFields.detail(id),
      input,
    );
    return data.field;
  },
  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.customFields.detail(id));
  },
};
