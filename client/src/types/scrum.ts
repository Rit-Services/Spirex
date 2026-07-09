// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { User } from './user';

export type EpicStatus = 'open' | 'in_progress' | 'done';
export type StoryType = 'story' | 'bug' | 'task';
export type StoryStatus = 'todo' | 'in_progress' | 'in_review' | 'qa' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type SprintStatus = 'planned' | 'active' | 'completed';

export const SCRUM_COLUMNS: { status: StoryStatus; label: string }[] = [
  { status: 'todo',        label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'in_review',   label: 'In Review' },
  { status: 'qa',          label: 'QA' },
  { status: 'done',        label: 'Done' },
];

export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  qa: 'QA',
  done: 'Done',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export interface Epic {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string | null;
  color: string;
  status: EpicStatus;
  startDate: string | null;
  targetDate: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: { stories: number };
  stories?: Story[];
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  _count?: { stories: number };
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}
export interface BurndownResponse {
  totalPoints: number;
  days: BurndownPoint[];
}

export interface Worklog {
  id: string;
  storyId: string;
  userId: string;
  timeSpentMinutes: number;
  startedAt: string;
  description: string | null;
  createdAt: string;
  user?: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface Comment {
  id: string;
  storyId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; name: string; email: string; avatarUrl: string | null; isExternal?: boolean };
}

export type ActivityEvent =
  | 'created'
  | 'status_changed'
  | 'workflow_status_changed'
  | 'assigned'
  | 'sprint_moved'
  | 'epic_changed'
  | 'commented'
  | 'worklogged'
  | 'subtask_added'
  | 'linked'
  | 'unlinked'
  | 'reporter_changed'
  | 'dates_changed'
  | 'custom_field_changed'
  | 'worklog_deleted'
  | 'attachment_deleted'
  | 'comment_deleted';

// ── Custom fields (Jira-style, project-scoped) ───────────────────────────
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Select',
  checkbox: 'Checkbox',
};

export interface CustomFieldDefinition {
  id: string;
  projectId: string;
  name: string;
  type: CustomFieldType;
  /** Only meaningful for type=select. */
  options: string[];
  isRequired: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** What a single stored value can be on the wire. */
export type CustomFieldPrimitive = string | number | boolean | null;

export interface CustomFieldValue {
  id: string;
  storyId: string;
  fieldId: string;
  value: CustomFieldPrimitive;
  field?: CustomFieldDefinition;
}

export type NotificationType =
  | 'story_assigned'
  | 'story_commented'
  | 'story_status_changed'
  | 'story_reporter_changed'
  | 'story_mentioned'
  | 'story_priority_changed'
  | 'story_updated'
  | 'weekly_digest'
  // Phase 2: cross-org "join my org" invitation (links to /invitations).
  | 'org_invite';

export type NotificationChannel = 'in_app' | 'email';

/** One cell of the profile-page notification grid. */
export interface NotificationPreference {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

/** Per-viewer watch state attached to a single-story payload. */
export interface StoryWatchState {
  isWatching: boolean;
  watcherCount: number;
}

/** A user in a story's watcher list. */
export type StoryWatcher = Pick<User, 'id' | 'name' | 'email' | 'avatarUrl'>;

export interface AppNotification {
  id: string;
  userId: string;
  // Phase 2: the org this notification belongs to. Drives the bell's per-org
  // filter and lets a cross-org click switch context before deep-linking.
  // Null for legacy rows (treated as "all orgs").
  organizationId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  storyId: string | null;
  storyKey: string | null;
  // Resolved server-side from the story's project, so a notification click can
  // deep-link to the full-page ticket. Null when the story no longer exists.
  projectId: string | null;
  read: boolean;
  createdAt: string;
}

export type StatusCategory = 'todo' | 'in_progress' | 'done';

export interface WorkflowStatus {
  id: string;
  projectId: string;
  coreStatus: StoryStatus;
  label: string;
  color: string;
  order: number;
  category: StatusCategory;
  /** Kanban work-in-progress limit for this column; null = no limit. */
  wipLimit: number | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LinkType =
  | 'blocks'
  | 'blocked_by'
  | 'duplicates'
  | 'duplicated_by'
  | 'relates_to'
  | 'reiterates'
  | 'reiterated_by';

export const LINK_LABELS: Record<LinkType, string> = {
  blocks: 'Blocks',
  blocked_by: 'Blocked by',
  duplicates: 'Duplicates',
  duplicated_by: 'Duplicated by',
  relates_to: 'Relates to',
  reiterates: 'Re-iterates (re-added from completed sprint)',
  reiterated_by: 'Re-iterated by (re-added in a later sprint)',
};

export interface StorySubtask {
  id: string;
  key: string;
  title: string;
  status: StoryStatus;
  statusId: string | null;
  type: StoryType;
  priority: Priority;
  assigneeId: string | null;
  assignee?: { id: string; name: string; email: string; avatarUrl: string | null; isExternal?: boolean } | null;
}

export interface StoryLink {
  id: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
  createdAt: string;
  target?: {
    id: string;
    key: string;
    title: string;
    status: StoryStatus;
    statusId: string | null;
    type: StoryType;
    priority: Priority;
    epic?: { id: string; key: string; title: string; color: string } | null;
  };
}

export interface ActivityEntry {
  id: string;
  storyId: string;
  actorId: string;
  event: ActivityEvent;
  fromValue: string | null;
  toValue: string | null;
  /** For `status_changed`: the CURRENT workflow column labels, resolved
   *  server-side so a column rename reflects across the whole history. Prefer
   *  these over from/toValue (which hold the raw core-status enum) when shown. */
  fromLabel?: string | null;
  toLabel?: string | null;
  /** Event-specific extras — e.g. { fieldName } for custom_field_changed. */
  meta?: { fieldName?: string } | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface VelocityResponse {
  sprints: {
    sprintId: string;
    sprintName: string;
    committedStories: number;
    completedStories: number;
    committedPoints: number;
    completedPoints: number;
  }[];
}

/** Project overview insights — team workload, epic progress, priority split. */
export interface ProjectOverviewResponse {
  totalStories: number;
  workload: { userId: string; name: string; total: number; done: number; remaining: number }[];
  epicProgress: {
    epicId: string;
    key: string;
    title: string;
    color: string;
    total: number;
    done: number;
  }[];
  priority: { priority: Priority; count: number }[];
}

export interface TimePerUserEntry {
  userId: string;
  name: string;
  email: string;
  minutes: number;
}
export type TimeRangeKey = 'week' | 'sprint' | 'month' | 'last-month' | 'custom' | 'all';
export interface TimePerUserResponse {
  range: TimeRangeKey;
  from: string;
  to: string;
  entries: TimePerUserEntry[];
}

export interface TimeTrackingPerStory {
  storyId: string;
  storyKey: string;
  storyTitle: string;
  storyType: StoryType;
  minutes: number;
  entries: number;
  /** Per-contributor split within the story (logger-credited), sorted desc. */
  byUser: { userId: string; name: string; minutes: number }[];
}
export interface TimeTrackingResponse {
  /** What window the data covers — a named sprint, or a date range. */
  scope: { kind: 'sprint' | 'range'; label: string };
  from: string;
  to: string;
  totalMinutes: number;
  perUser: TimePerUserEntry[];
  perStory: TimeTrackingPerStory[];
  daily: { date: string; minutes: number }[];
}

export interface StatusBreakdownResponse {
  total: number;
  entries: { status: StoryStatus; count: number }[];
}

export interface TypeBreakdownResponse {
  total: number;
  entries: { type: StoryType; count: number }[];
}

export interface EstimateVsLoggedEntry {
  userId: string;
  name: string;
  email: string;
  estimateMinutes: number;
  loggedMinutes: number;
}
export interface EstimateVsLoggedResponse {
  totalEstimateMinutes: number;
  totalLoggedMinutes: number;
  entries: EstimateVsLoggedEntry[];
}

/** Full project-scoped label row (the label-management surface). */
export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

/** The compact label shape attached to a story for badge rendering. */
export interface LabelChip {
  id: string;
  name: string;
  color: string;
}

export interface Story {
  id: string;
  projectId: string;
  key: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string | null;
  type: StoryType;
  status: StoryStatus;
  /** Phase 9A.2 — specific workflow column placement (null = fall back to status). */
  statusId: string | null;
  priority: Priority;
  storyPoints: number | null;
  originalEstimateMinutes: number | null;
  epicId: string | null;
  sprintId: string | null;
  assigneeId: string | null;
  reporterId: string;
  parentStoryId: string | null;
  sourceImageImportId?: string | null;
  /** Provenance marker for non-relational creation paths — e.g. 'voice-agent'. */
  source?: string | null;
  /** Optional start + due date (ISO strings). */
  startDate: string | null;
  dueDate: string | null;
  rank: number;
  createdAt: string;
  updatedAt: string;
  epic?: { id: string; key: string; title: string; color: string } | null;
  /** Project labels attached to this story — flattened to a colored-badge shape
   *  (mirrors the epic subset). Always present on list/detail payloads. */
  labels?: LabelChip[];
  /** Hydrated only when this story is a subtask — used for the breadcrumb. */
  parent?: { id: string; key: string; title: string } | null;
  assignee?: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'isExternal'> | null;
  reporter?: Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'isExternal'>;
  subtasks?: StorySubtask[];
  /** Hydrated on single-story fetches; ordered by the definition's order. */
  customFieldValues?: CustomFieldValue[];
  _count?: { subtasks: number; outgoingLinks: number; attachments?: number };
  /** Watch state — populated only on single-story fetches, not list payloads. */
  isWatching?: boolean;
  watcherCount?: number;
}
