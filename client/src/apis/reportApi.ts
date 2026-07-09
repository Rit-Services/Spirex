// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type {
  BurndownResponse,
  EstimateVsLoggedResponse,
  ProjectOverviewResponse,
  StatusBreakdownResponse,
  TimePerUserResponse,
  TimeRangeKey,
  TimeTrackingResponse,
  TypeBreakdownResponse,
  VelocityResponse,
} from '@/types/scrum';

export type WorklogExplorerRange = 'week' | 'last-week' | 'month' | 'last-month' | 'custom';

export interface WorklogExplorerQuery {
  userId?: string;
  range?: WorklogExplorerRange;
  from?: string;
  to?: string;
  projectId?: string;
}

export interface WorklogExplorerResponse {
  range: string;
  userId: string;
  from: string;
  to: string;
  totalMinutes: number;
  daily: { date: string; minutes: number }[];
  perStory: {
    storyId: string;
    storyKey: string;
    storyTitle: string;
    projectId: string;
    projectKey: string;
    projectName: string;
    minutes: number;
    entries: number;
  }[];
}

export const reportApi = {
  async overview(projectId: string): Promise<ProjectOverviewResponse> {
    const { data } = await httpClient.get<ProjectOverviewResponse>(urls.reports.overview, {
      params: { projectId },
    });
    return data;
  },
  async burndown(sprintId: string): Promise<BurndownResponse> {
    const { data } = await httpClient.get<BurndownResponse>(urls.reports.burndown(sprintId));
    return data;
  },
  async velocity(projectId: string, last = 5): Promise<VelocityResponse> {
    const { data } = await httpClient.get<VelocityResponse>(urls.reports.velocity(projectId, last));
    return data;
  },
  async timePerUser(
    projectId: string,
    range: TimeRangeKey,
    custom?: { from?: string; to?: string },
  ): Promise<TimePerUserResponse> {
    const { data } = await httpClient.get<TimePerUserResponse>(urls.reports.timePerUser, {
      params: { projectId, range, from: custom?.from, to: custom?.to },
    });
    return data;
  },
  async statusBreakdown(projectId: string, opts?: { from?: string; to?: string; sprintId?: string }): Promise<StatusBreakdownResponse> {
    const { data } = await httpClient.get<StatusBreakdownResponse>(urls.reports.statusBreakdown, {
      params: { projectId, from: opts?.from, to: opts?.to, sprintId: opts?.sprintId },
    });
    return data;
  },
  async typeBreakdown(projectId: string, opts?: { from?: string; to?: string; sprintId?: string }): Promise<TypeBreakdownResponse> {
    const { data } = await httpClient.get<TypeBreakdownResponse>(urls.reports.typeBreakdown, {
      params: { projectId, from: opts?.from, to: opts?.to, sprintId: opts?.sprintId },
    });
    return data;
  },
  async estimateVsLogged(projectId: string, sprintId?: string): Promise<EstimateVsLoggedResponse> {
    const { data } = await httpClient.get<EstimateVsLoggedResponse>(urls.reports.estimateVsLogged, {
      params: { projectId, sprintId },
    });
    return data;
  },
  /**
   * Unified time-tracking feed for the project reports "Time tracking" tab.
   * Pass EITHER a sprintId (window resolved from sprint dates) OR a range
   * (week/month/last-month/custom + from/to). Optional userId narrows to one
   * contributor.
   */
  async timeTracking(params: {
    projectId: string;
    range?: TimeRangeKey;
    from?: string;
    to?: string;
    sprintId?: string;
    userId?: string;
  }): Promise<TimeTrackingResponse> {
    const { data } = await httpClient.get<TimeTrackingResponse>(urls.reports.timeTracking, { params });
    return data;
  },
  async worklogExplorer(q: WorklogExplorerQuery): Promise<WorklogExplorerResponse> {
    const { data } = await httpClient.get<WorklogExplorerResponse>(urls.reports.worklogExplorer, {
      params: q,
    });
    return data;
  },
};
