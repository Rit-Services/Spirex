// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { StatusCategory, StoryStatus, WorkflowStatus } from '@/types/scrum';

export interface WorkflowBulkUpdateItem {
  id: string;
  label?: string;
  color?: string;
  order?: number;
  category?: StatusCategory;
  /** Positive cap, null to clear the cap, omit to leave unchanged. */
  wipLimit?: number | null;
}

export interface CreateWorkflowColumnInput {
  coreStatus: StoryStatus;
  label: string;
  color: string;
  category: StatusCategory;
  order?: number;
}

export const workflowApi = {
  async listByProject(projectId: string): Promise<WorkflowStatus[]> {
    const { data } = await httpClient.get<{ workflow: WorkflowStatus[] }>(
      urls.workflow.byProject(projectId),
    );
    return data.workflow;
  },

  async bulkUpdate(projectId: string, items: WorkflowBulkUpdateItem[]): Promise<WorkflowStatus[]> {
    const { data } = await httpClient.put<{ workflow: WorkflowStatus[] }>(
      urls.workflow.bulkUpdate(projectId),
      { items },
    );
    return data.workflow;
  },

  async resetDefaults(projectId: string): Promise<WorkflowStatus[]> {
    const { data } = await httpClient.post<{ workflow: WorkflowStatus[] }>(
      urls.workflow.reset(projectId),
    );
    return data.workflow;
  },

  async createColumn(projectId: string, input: CreateWorkflowColumnInput): Promise<WorkflowStatus> {
    const { data } = await httpClient.post<{ status: WorkflowStatus }>(
      urls.workflow.createColumn(projectId),
      input,
    );
    return data.status;
  },

  async removeColumn(id: string): Promise<void> {
    await httpClient.delete(urls.workflow.remove(id));
  },
};
