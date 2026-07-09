// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type {
  ActivityEntry,
  CustomFieldPrimitive,
  LinkType,
  Priority,
  Story,
  StoryLink,
  StoryStatus,
  StoryType,
  StoryWatcher,
  StoryWatchState,
} from '@/types/scrum';

export interface StoryListFilters {
  projectId: string;
  sprintId?: string | 'null';       // 'null' literal → backlog-only
  /** 'true' → stories in any OPEN (active|planned) sprint, one query, no fan-out. */
  inOpenSprints?: 'true' | 'false';
  status?: StoryStatus | 'all';
  /** Filter to a specific workflow column (WorkflowStatus.id) — board parity. */
  statusId?: string;
  assigneeId?: string;
  epicId?: string | 'null';
  /** Filter to stories carrying this label id. */
  labelId?: string;
  type?: StoryType;
  priority?: Priority;
  search?: string;
  parentStoryId?: string | 'null';
  includeSubtasks?: 'true' | 'false';
  /** JSON-encoded { [definitionId]: value } exact-match filters. */
  customFields?: string;
}

export interface CreateStoryInput {
  projectId: string;
  title: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  type?: StoryType;
  priority?: Priority;
  storyPoints?: number | null;
  originalEstimateMinutes?: number | null;
  epicId?: string | null;
  /** Create directly onto a sprint; omit/null → backlog. */
  sprintId?: string | null;
  /** Initial workflow status; sprint-targeted creates pass 'todo'. */
  status?: StoryStatus;
  assigneeId?: string | null;
  parentStoryId?: string | null;
  /** ISO date strings (YYYY-MM-DD from date inputs); null clears. */
  startDate?: string | null;
  dueDate?: string | null;
  /** Custom field values keyed by definition id; null clears a value. */
  customFields?: Record<string, CustomFieldPrimitive>;
  /** Label ids to attach at creation. */
  labelIds?: string[];
}

export type UpdateStoryInput = Partial<Omit<CreateStoryInput, 'projectId'>> & {
  reporterId?: string;
};

/** AI enhancement draft returned by POST /stories/:id/ai/enhance. */
export interface EnhanceDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
}

export type { ActivityEntry };

/** One row of the dashboard "My issues" widget (lean — no labels/counts). */
export interface AssignedIssue {
  id: string;
  key: string;
  title: string;
  status: StoryStatus;
  statusId: string | null;
  type: StoryType;
  priority: Priority;
  projectId: string;
  project: { id: string; key: string; name: string };
  updatedAt: string;
}

export const storyApi = {
  async list(filters: StoryListFilters): Promise<Story[]> {
    const { data } = await httpClient.get<{ stories: Story[] }>(urls.stories.list, { params: filters });
    return data.stories;
  },
  /**
   * Issues assigned to the logged-in user across every project in their active
   * org. `statuses` is the visible-status filter (omit → server default open
   * set); results come back already prioritised In Progress → To Do → Review → QA.
   */
  async assignedToMe(params?: { statuses?: StoryStatus[]; limit?: number }): Promise<{
    issues: AssignedIssue[];
    total: number;
  }> {
    const { data } = await httpClient.get<{ issues: AssignedIssue[]; total: number }>(
      urls.stories.assignedToMe,
      {
        params: {
          statuses: params?.statuses?.length ? params.statuses.join(',') : undefined,
          limit: params?.limit,
        },
      },
    );
    return data;
  },
  async get(id: string): Promise<Story> {
    const { data } = await httpClient.get<{ story: Story }>(urls.stories.detail(id));
    return data.story;
  },
  async getByKey(key: string): Promise<Story> {
    const { data } = await httpClient.get<{ story: Story }>(urls.stories.byKey(key));
    return data.story;
  },
  async create(input: CreateStoryInput): Promise<Story> {
    const { data } = await httpClient.post<{ story: Story }>(urls.stories.create, input);
    return data.story;
  },
  async update(id: string, input: UpdateStoryInput): Promise<Story> {
    const { data } = await httpClient.patch<{ story: Story }>(urls.stories.detail(id), input);
    return data.story;
  },
  async changeStatus(id: string, status: StoryStatus): Promise<Story> {
    const { data } = await httpClient.patch<{ story: Story }>(urls.stories.status(id), { status });
    return data.story;
  },
  /** Drag-reorder: place this story between `prevId` (above) and `nextId` (below). */
  async reorder(id: string, prevId: string | null, nextId: string | null): Promise<Story> {
    const { data } = await httpClient.patch<{ story: Story }>(urls.stories.rank(id), {
      prevId,
      nextId,
    });
    return data.story;
  },

  async changeStatusRow(
    id: string,
    statusRowId: string,
    cascadeSubtasks?: boolean,
  ): Promise<Story> {
    const { data } = await httpClient.patch<{ story: Story }>(urls.stories.statusRow(id), {
      statusRowId,
      // Only send when true — a done-column move that should carry the parent's
      // open subtasks along. Omitted otherwise so the payload stays minimal.
      ...(cascadeSubtasks ? { cascadeSubtasks: true } : {}),
    });
    return data.story;
  },
  async changeSprint(id: string, sprintId: string | null): Promise<Story> {
    const { data } = await httpClient.patch<{ story: Story }>(urls.stories.sprint(id), { sprintId });
    return data.story;
  },
  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.stories.detail(id));
  },
  async activity(id: string): Promise<ActivityEntry[]> {
    const { data } = await httpClient.get<{ activity: ActivityEntry[] }>(urls.stories.activity(id));
    return data.activity;
  },
  async listLinks(id: string): Promise<StoryLink[]> {
    const { data } = await httpClient.get<{ links: StoryLink[] }>(urls.stories.links(id));
    return data.links;
  },
  async createLink(id: string, input: { targetId: string; type: LinkType }): Promise<StoryLink> {
    const { data } = await httpClient.post<{ link: StoryLink }>(urls.stories.links(id), input);
    return data.link;
  },
  async removeLink(id: string, linkId: string): Promise<void> {
    await httpClient.delete(urls.stories.link(id, linkId));
  },
  async reiterate(id: string): Promise<Story> {
    const { data } = await httpClient.post<{ story: Story }>(urls.stories.reiterate(id));
    return data.story;
  },
  async watch(id: string): Promise<StoryWatchState> {
    const { data } = await httpClient.post<{ watch: StoryWatchState }>(urls.stories.watch(id));
    return data.watch;
  },
  async unwatch(id: string): Promise<StoryWatchState> {
    const { data } = await httpClient.delete<{ watch: StoryWatchState }>(urls.stories.watch(id));
    return data.watch;
  },
  async listWatchers(id: string): Promise<StoryWatcher[]> {
    const { data } = await httpClient.get<{ watchers: StoryWatcher[] }>(
      urls.stories.watchers(id),
    );
    return data.watchers;
  },
  /** Attach a label; returns the freshly hydrated story (with updated labels). */
  async attachLabel(id: string, labelId: string): Promise<Story> {
    const { data } = await httpClient.post<{ story: Story }>(urls.stories.labels(id), { labelId });
    return data.story;
  },
  /** Detach a label; returns the freshly hydrated story. */
  async detachLabel(id: string, labelId: string): Promise<Story> {
    const { data } = await httpClient.delete<{ story: Story }>(urls.stories.label(id, labelId));
    return data.story;
  },
  /** AI enhancement DRAFT — nothing is saved until the user applies it via update(). */
  async aiEnhance(id: string): Promise<EnhanceDraft> {
    const { data } = await httpClient.post<{ draft: EnhanceDraft }>(urls.stories.aiEnhance(id));
    return data.draft;
  },
  /** AI acceptance-criteria draft — review-then-save, never persisted here. */
  async aiAcceptanceCriteria(id: string): Promise<string> {
    const { data } = await httpClient.post<{ acceptanceCriteria: string }>(
      urls.stories.aiAcceptanceCriteria(id),
    );
    return data.acceptanceCriteria;
  },
};
