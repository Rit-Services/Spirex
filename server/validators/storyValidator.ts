// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

const storyType = z.enum(['story', 'bug', 'task']);
const storyStatus = z.enum(['todo', 'in_progress', 'in_review', 'qa', 'done']);
const priority = z.enum(['low', 'medium', 'high', 'critical']);
const isoDate = z.string().datetime().or(z.string().date()).nullable().optional();
// Custom field values keyed by definition id. Per-type validation (select
// options, number vs string…) happens in customFieldService against the
// project's definitions — the shape check here just bounds the payload.
const customFieldValues = z
  .record(z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
  .optional();
const linkType = z.enum([
  'blocks',
  'blocked_by',
  'duplicates',
  'duplicated_by',
  'relates_to',
  'reiterates',
  'reiterated_by',
]);

export const createStorySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10_000).optional().nullable(),
  acceptanceCriteria: z.string().max(10_000).optional().nullable(),
  type: storyType.optional(),
  priority: priority.optional(),
  storyPoints: z.number().int().min(0).max(100).optional().nullable(),
  originalEstimateMinutes: z.number().int().min(0).optional().nullable(),
  epicId: z.string().optional().nullable(),
  sprintId: z.string().optional().nullable(),
  status: storyStatus.optional(),
  assigneeId: z.string().optional().nullable(),
  parentStoryId: z.string().optional().nullable(),
  startDate: isoDate,
  dueDate: isoDate,
  customFields: customFieldValues,
  // Label ids to attach at creation. Validated against the project's labels in
  // the service (foreign / cross-project ids are dropped, not 400'd).
  labelIds: z.array(z.string().min(1)).max(50).optional(),
});

export const updateStorySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10_000).optional().nullable(),
  acceptanceCriteria: z.string().max(10_000).optional().nullable(),
  type: storyType.optional(),
  priority: priority.optional(),
  storyPoints: z.number().int().min(0).max(100).optional().nullable(),
  originalEstimateMinutes: z.number().int().min(0).optional().nullable(),
  epicId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  parentStoryId: z.string().optional().nullable(),
  reporterId: z.string().min(1).optional(),
  startDate: isoDate,
  dueDate: isoDate,
  customFields: customFieldValues,
});

export const changeStatusSchema = z.object({ status: storyStatus });

export const storyIdParamsSchema = z.object({ id: z.string().min(1) });

export const storyListQuerySchema = z.object({
  projectId: z.string().min(1),
  sprintId: z.string().optional(),                 // "null" literal string → backlog-only
  // "true" → only stories in an OPEN (active|planned) sprint, across all such
  // sprints in one query. Powers the backlog page's sprint lanes without a
  // per-sprint request fan-out, and excludes completed-sprint stories.
  inOpenSprints: z.enum(['true', 'false']).optional(),
  status: storyStatus.or(z.literal('all')).optional(),
  // Filter by a SPECIFIC workflow column (WorkflowStatus.id) — lets the backlog
  // mirror the board, which is built on dynamic/imported columns rather than the
  // six core statuses. Takes precedence is not implied; both can be sent.
  statusId: z.string().optional(),
  assigneeId: z.string().optional(),
  epicId: z.string().optional(),                   // "null" literal string → no epic
  labelId: z.string().optional(),                  // filter to stories carrying this label
  type: storyType.optional(),
  priority: priority.optional(),
  search: z.string().optional(),
  parentStoryId: z.string().optional(),            // "null" → top-level only
  includeSubtasks: z.enum(['true', 'false']).optional(),
  // JSON-encoded { [definitionId]: value } map — exact-match filters on
  // custom field values. Parsed + sanitized in the controller.
  customFields: z.string().max(2000).optional(),
});

export type StoryListQuery = z.infer<typeof storyListQuerySchema>;

// "Assigned to me" dashboard widget — issues assigned to the caller across every
// project in their active org. `statuses` is a CSV of core statuses to include
// (any "done" entry is dropped server-side); absent → the default open set.
export const assignedToMeQuerySchema = z.object({
  statuses: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// Drag-reorder: the story is placed between `prevId` (now above) and `nextId`
// (now below). Either is null at a list edge.
export const reorderStorySchema = z.object({
  prevId: z.string().min(1).nullable().optional(),
  nextId: z.string().min(1).nullable().optional(),
});

export const linkStorySchema = z.object({
  targetId: z.string().min(1),
  type: linkType,
});

export const linkIdParamsSchema = z.object({
  id: z.string().min(1),
  linkId: z.string().min(1),
});
