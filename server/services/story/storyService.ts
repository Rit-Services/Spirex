// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { storyModel } from '../../models/story/story.js';
import { projectMemberModel } from '../../models/project/project.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { activityService } from '../activity/activityService.js';
import { notificationService } from '../notification/notificationService.js';
import { workflowService } from '../workflow/workflowService.js';
import { attachmentService } from '../attachment/attachmentService.js';
import {
  customFieldService,
  type CustomFieldRawValue,
} from '../customField/customFieldService.js';
import { storage } from '../storage/index.js';
import logger from '../../utils/logger.js';
import type { Prisma, StoryStatus, StoryType, Priority, LinkType } from '@prisma/client';

// "Assigned to me" dashboard widget. Default visible set = every non-done core
// status; the sort puts In Progress first, then To Do, then Review, then QA —
// the requested prioritisation. `done` is never shown (priority 99 is a guard
// for any status that slips through). Users adjust the visible set via filters.
const ASSIGNED_STATUS_PRIORITY: Record<StoryStatus, number> = {
  in_progress: 0,
  todo: 1,
  in_review: 2,
  qa: 3,
  done: 99,
};
const DEFAULT_ASSIGNED_STATUSES: StoryStatus[] = ['in_progress', 'todo', 'in_review', 'qa'];

// Spacing between consecutive story ranks. Large gaps let a drag-reorder drop a
// story at the midpoint of its new neighbours WITHOUT renumbering the list. When
// a gap finally closes (no integer between two neighbours), we rebalance.
const RANK_GAP = 1000;

/**
 * Renumber a project's top-level stories with fresh, evenly-spaced ranks, then
 * splice `movedId` into place right after `prevId` (or at the top when null).
 * Called only when a midpoint insert runs out of room — rare with RANK_GAP.
 */
async function rebalanceRanks(projectId: string, movedId: string, prevId: string | null) {
  return prisma.$transaction(async (tx) => {
    const all = await tx.story.findMany({
      where: { projectId, parentStoryId: null },
      orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const order = all.map((s) => s.id).filter((x) => x !== movedId);
    const at = prevId ? order.indexOf(prevId) + 1 : 0;
    order.splice(at, 0, movedId);

    // Renumber in ONE statement, not a per-row loop. The old loop did N
    // sequential `tx.story.update`s inside this interactive transaction; on a
    // large project (notably a fresh Jira import, where every rank is still the
    // default 0 so EVERY reorder lands here) that blew past Prisma's 5s
    // transaction timeout → P2028 "Transaction not found". A single bulk UPDATE
    // keyed off `unnest` of two positional arrays is one round trip and can't
    // time out. After it runs once, ranks are spaced RANK_GAP apart and later
    // reorders find midpoints — so this path goes back to being rare.
    const ids = order;
    const ranks = order.map((_, i) => (i + 1) * RANK_GAP);
    await tx.$executeRaw`
      UPDATE "Story" AS s
      SET "rank" = data.new_rank
      FROM unnest(${ids}::text[], ${ranks}::int[]) AS data(id, new_rank)
      WHERE s.id = data.id;
    `;
    return tx.story.findUnique({ where: { id: movedId } });
  });
}

// Authoritative check: the chosen assignee MUST be a member of the project
// the story belongs to. Global admins are allowed to *perform* the assign
// action, but they cannot assign someone (including themselves) who isn't
// on the project. Permission to act ≠ eligibility to receive.
async function assertAssigneeIsProjectMember(projectId: string, assigneeId: string) {
  const member = await projectMemberModel.findForUser(projectId, assigneeId);
  if (!member) {
    throw ErrorResponse.badRequest('Assignee must be a project member');
  }
}

export interface StoryFilters {
  projectId: string;
  sprintId?: string | null;       // null → backlog only
  /** true → only stories in an OPEN (active|planned) sprint, any such sprint. */
  inOpenSprints?: boolean;
  status?: StoryStatus | 'all';
  /** Filter to a specific workflow column (WorkflowStatus.id) — board parity. */
  statusId?: string;
  assigneeId?: string;
  epicId?: string | null;
  /** Filter to stories carrying this label (StoryLabel.labelId). */
  labelId?: string;
  type?: StoryType;
  priority?: Priority;
  search?: string;
  /**
   * Hide subtasks from top-level lists (board + backlog) by default.
   * Pass `includeSubtasks=true` for views that want them (e.g. search).
   */
  includeSubtasks?: boolean;
  parentStoryId?: string | null;
  /** Exact-match filters on custom field values, keyed by definition id. */
  customFields?: Record<string, string | number | boolean>;
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
  assigneeId?: string | null;
  reporterId: string;
  parentStoryId?: string | null;
  // Create the story directly onto a sprint (e.g. the board's "To Do" column
  // or a sprint lane on the backlog page). Omit/null → lands in the backlog.
  sprintId?: string | null;
  // Initial workflow status. Defaults to `backlog` for top-level stories
  // (`todo` for subtasks). Sprint-targeted creates pass `todo` explicitly so
  // the new card shows on the board instead of the hidden backlog column.
  status?: StoryStatus;
  // Provenance marker for non-relational creation paths (e.g. 'voice-agent').
  source?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  // Custom field values keyed by definition id (validated per-type in
  // customFieldService against the project's definitions).
  customFields?: Record<string, CustomFieldRawValue>;
  // Label ids to attach on creation. Filtered to the project's labels in the
  // service (foreign ids are silently dropped — never created here).
  labelIds?: string[];
}

export interface UpdateStoryInput {
  title?: string;
  description?: string | null;
  acceptanceCriteria?: string | null;
  type?: StoryType;
  priority?: Priority;
  storyPoints?: number | null;
  originalEstimateMinutes?: number | null;
  epicId?: string | null;
  assigneeId?: string | null;
  parentStoryId?: string | null;
  reporterId?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  customFields?: Record<string, CustomFieldRawValue>;
}

/** `2026-06-11` for the activity feed; em dash when unset. */
function fmtDate(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : '—';
}

/**
 * Activity logging + notification dispatch for a story update. Invoked as a
 * fire-and-forget side effect AFTER the HTTP response is sent — a missed
 * notification is an accepted trade-off so a save never waits on email I/O.
 */
async function dispatchStoryUpdateNotifications(
  before: NonNullable<Awaited<ReturnType<typeof storyModel.findById>>>,
  input: UpdateStoryInput,
  actorId: string,
) {
  const id = before.id;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true },
  });
  // Shared fields for every dispatch this update may fire.
  const base = {
    storyId: id,
    storyKey: before.key,
    storyTitle: before.title,
    actorId,
    actorName: actor?.name ?? 'Someone',
    body: before.title,
  };

  // --- assignee change ---
  if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId) {
    await activityService.log({
      storyId: id,
      actorId,
      event: 'assigned',
      fromValue: before.assigneeId,
      toValue: input.assigneeId,
    });
    if (input.assigneeId) {
      // The new assignee implicitly watches the story from now on.
      await notificationService.ensureWatcher(id, input.assigneeId);
      const assignee = await prisma.user.findUnique({
        where: { id: input.assigneeId },
        select: { name: true },
      });
      const name = assignee?.name ?? 'someone';
      await notificationService.dispatch({
        ...base,
        type: 'story_assigned',
        title: `${base.actorName} assigned ${before.key} to ${name}`,
        emailHeadline: `assigned this story to ${name}`,
      });
    }
  }

  // --- epic change (activity only; folded into the story_updated notice) ---
  if (input.epicId !== undefined && input.epicId !== before.epicId) {
    await activityService.log({
      storyId: id,
      actorId,
      event: 'epic_changed',
      fromValue: before.epicId,
      toValue: input.epicId,
    });
  }

  // --- reporter change ---
  if (input.reporterId !== undefined && input.reporterId !== before.reporterId) {
    await activityService.log({
      storyId: id,
      actorId,
      event: 'reporter_changed',
      fromValue: before.reporterId,
      toValue: input.reporterId,
    });
    // The new reporter implicitly watches the story from now on.
    await notificationService.ensureWatcher(id, input.reporterId);
    const reporter = await prisma.user.findUnique({
      where: { id: input.reporterId },
      select: { name: true },
    });
    const name = reporter?.name ?? 'someone';
    await notificationService.dispatch({
      ...base,
      type: 'story_reporter_changed',
      title: `${base.actorName} changed ${before.key} reporter to ${name}`,
      emailHeadline: `changed the reporter to ${name}`,
    });
  }

  // --- priority change ---
  if (input.priority !== undefined && input.priority !== before.priority) {
    await notificationService.dispatch({
      ...base,
      type: 'story_priority_changed',
      title: `${base.actorName} set ${before.key} priority to ${input.priority}`,
      emailHeadline: `changed the priority to ${input.priority}`,
    });
  }

  // --- start/due date change (one combined activity entry) ---
  const startChanged =
    input.startDate !== undefined &&
    (input.startDate?.getTime() ?? null) !== (before.startDate?.getTime() ?? null);
  const dueChanged =
    input.dueDate !== undefined &&
    (input.dueDate?.getTime() ?? null) !== (before.dueDate?.getTime() ?? null);
  if (startChanged || dueChanged) {
    const nextStart = input.startDate !== undefined ? input.startDate : before.startDate;
    const nextDue = input.dueDate !== undefined ? input.dueDate : before.dueDate;
    await activityService.log({
      storyId: id,
      actorId,
      event: 'dates_changed',
      fromValue: `${fmtDate(before.startDate)} – ${fmtDate(before.dueDate)}`,
      toValue: `${fmtDate(nextStart)} – ${fmtDate(nextDue)}`,
    });
  }

  // --- catch-all: any other field edit fires a single story_updated ---
  const OTHER_FIELDS: (keyof UpdateStoryInput)[] = [
    'title',
    'description',
    'acceptanceCriteria',
    'type',
    'storyPoints',
    'originalEstimateMinutes',
    'epicId',
  ];
  const beforeRecord = before as unknown as Record<string, unknown>;
  const otherEdited =
    OTHER_FIELDS.some((f) => input[f] !== undefined && input[f] !== beforeRecord[f]) ||
    startChanged ||
    dueChanged ||
    // Custom field edits fold into the same story_updated notice; the
    // per-field activity entries are written by customFieldService.
    (input.customFields !== undefined && Object.keys(input.customFields).length > 0);
  if (otherEdited) {
    await notificationService.dispatch({
      ...base,
      type: 'story_updated',
      title: `${base.actorName} updated ${before.key}`,
      emailHeadline: 'updated this story',
    });
  }
}

/**
 * For every user-visible `LinkType` there's an inverse: creating
 * `blocks A→B` implicitly writes `blocked_by B→A` in the same transaction so
 * the graph is always consistent. `relates_to` is its own inverse.
 */
const LINK_INVERSE: Record<LinkType, LinkType> = {
  blocks: 'blocked_by',
  blocked_by: 'blocks',
  duplicates: 'duplicated_by',
  duplicated_by: 'duplicates',
  relates_to: 'relates_to',
  reiterates: 'reiterated_by',
  reiterated_by: 'reiterates',
};

export const storyService = {
  async list(f: StoryFilters) {
    const where: Prisma.StoryWhereInput = { projectId: f.projectId };
    if (f.sprintId === null) where.sprintId = null;
    else if (typeof f.sprintId === 'string') where.sprintId = f.sprintId;
    // Open-sprint scope: stories whose sprint is active or planned. Filtering on
    // the sprint relation's status (not a sprintId list) lets the backlog page
    // load EVERY visible sprint lane in one query, while completed-sprint stories
    // — which the backlog never shows — are excluded server-side.
    if (f.inOpenSprints) where.sprint = { status: { in: ['active', 'planned'] } };

    if (f.status && f.status !== 'all') where.status = f.status;
    if (f.statusId) where.statusId = f.statusId;
    if (f.assigneeId) where.assigneeId = f.assigneeId;
    if (f.epicId === null) where.epicId = null;
    else if (typeof f.epicId === 'string') where.epicId = f.epicId;
    if (f.labelId) where.labels = { some: { labelId: f.labelId } };
    if (f.type) where.type = f.type;
    if (f.priority) where.priority = f.priority;

    // Subtask visibility: if caller asks for a specific parentStoryId, honour it;
    // otherwise default to hiding subtasks on board + backlog views unless
    // explicitly opted in.
    if (f.parentStoryId !== undefined) {
      where.parentStoryId = f.parentStoryId;
    } else if (!f.includeSubtasks) {
      where.parentStoryId = null;
    }

    if (f.search && f.search.trim()) {
      const q = f.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { key: { contains: q.toUpperCase() } },
      ];
    }

    // Custom field filters: every entry must match (AND of `some` clauses on
    // the value rows). JSON equality is exact — selects/checkboxes, the only
    // types the filter UI exposes, store plain scalars so this is precise.
    if (f.customFields) {
      const clauses: Prisma.StoryWhereInput[] = Object.entries(f.customFields).map(
        ([fieldId, value]) => ({
          customFieldValues: { some: { fieldId, value: { equals: value } } },
        }),
      );
      if (clauses.length) where.AND = clauses;
    }
    return storyModel.list(where);
  },

  /**
   * Issues assigned to `userId` across every project in their active org —
   * the dashboard "My issues" widget. `statuses` (the caller's filter) defaults
   * to the open set; any `done` is stripped so completed issues never show.
   * Results are ordered by status priority (In Progress → To Do → Review → QA),
   * then most-recently-updated, and capped to `limit` (default 20).
   */
  async assignedToMe(params: {
    userId: string;
    organizationId: string;
    statuses?: StoryStatus[];
    limit?: number;
  }) {
    const requested = params.statuses?.length ? params.statuses : DEFAULT_ASSIGNED_STATUSES;
    const statuses = requested.filter((s) => s !== 'done');
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    if (statuses.length === 0) return { issues: [], total: 0 };

    const rows = await storyModel.assignedToMe({
      userId: params.userId,
      organizationId: params.organizationId,
      statuses,
    });
    const sorted = rows.sort((a, b) => {
      const pa = ASSIGNED_STATUS_PRIORITY[a.status] ?? 50;
      const pb = ASSIGNED_STATUS_PRIORITY[b.status] ?? 50;
      if (pa !== pb) return pa - pb;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
    return { issues: sorted.slice(0, limit), total: sorted.length };
  },

  async get(id: string) {
    const story = await storyModel.findById(id);
    if (!story) throw ErrorResponse.notFound('Story not found');
    return story;
  },

  /**
   * Lookup by unique `<PROJECTKEY>-<n>` story key. Used by the URL-driven
   * detail panel (`?story=KDG-42`) so deep-links and subtask links work
   * without the client having to resolve key→id first.
   */
  async getByKey(key: string) {
    const lite = await storyModel.findByKey(key);
    if (!lite) throw ErrorResponse.notFound('Story not found');
    return storyModel.findById(lite.id);
  },

  async create(input: CreateStoryInput, actorId: string) {
    if (input.assigneeId) {
      await assertAssigneeIsProjectMember(input.projectId, input.assigneeId);
    }
    // Reject bad custom field values BEFORE the story row exists — otherwise a
    // 400 here would leave a half-created ticket behind.
    if (input.customFields) {
      await customFieldService.validateForProject(input.projectId, input.customFields);
    }
    const story = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw ErrorResponse.notFound('Project not found');

      // Depth guard: a subtask cannot have a subtask. Also confirm the parent
      // lives in the same project (prevents cross-project contamination).
      if (input.parentStoryId) {
        const parent = await tx.story.findUnique({ where: { id: input.parentStoryId } });
        if (!parent) throw ErrorResponse.notFound('Parent story not found');
        if (parent.projectId !== input.projectId) {
          throw ErrorResponse.badRequest('Parent story must be in the same project');
        }
        if (parent.parentStoryId !== null) {
          throw ErrorResponse.badRequest('Subtasks cannot have subtasks of their own');
        }
      }

      const n = project.nextStoryNumber;
      await tx.project.update({
        where: { id: input.projectId },
        data: { nextStoryNumber: n + 1 },
      });
      // Every new story starts in To Do (top-level stories live in the backlog
      // until added to a sprint — backlog is now purely `sprintId IS NULL`, not
      // a status). statusId is synced below so the board can always place it.
      const effectiveStatus = input.status ?? 'todo';
      // Keep statusId in sync from birth — the default column for the status —
      // so the dynamic-column board can always place the card.
      const statusId = await workflowService.defaultStatusId(
        input.projectId,
        effectiveStatus,
        tx,
      );
      // Manual ordering (Jira-style rank). Only TOP-LEVEL stories are ranked
      // (subtasks list under their parent by createdAt). New stories go to the
      // BOTTOM: one gap past the current max rank in the project.
      let rank = 0;
      if (!input.parentStoryId) {
        const max = await tx.story.aggregate({
          where: { projectId: input.projectId, parentStoryId: null },
          _max: { rank: true },
        });
        rank = (max._max.rank ?? 0) + RANK_GAP;
      }
      return tx.story.create({
        data: {
          projectId: input.projectId,
          key: `${project.key}-${n}`,
          title: input.title,
          description: input.description ?? null,
          acceptanceCriteria: input.acceptanceCriteria ?? null,
          type: input.type ?? 'story',
          status: effectiveStatus,
          statusId,
          priority: input.priority ?? 'medium',
          storyPoints: input.storyPoints ?? null,
          originalEstimateMinutes: input.originalEstimateMinutes ?? null,
          epicId: input.epicId ?? null,
          sprintId: input.sprintId ?? null,
          assigneeId: input.assigneeId ?? null,
          reporterId: input.reporterId,
          parentStoryId: input.parentStoryId ?? null,
          source: input.source ?? null,
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          rank,
        },
      });
    });
    if (input.customFields) {
      await customFieldService.applyValues(story.id, input.projectId, input.customFields, actorId);
    }
    // Attach labels — only those that genuinely belong to this project, so a
    // stale/foreign id from the client can't leak another project's label on.
    if (input.labelIds?.length) {
      const valid = await prisma.label.findMany({
        where: { projectId: input.projectId, id: { in: input.labelIds } },
        select: { id: true },
      });
      if (valid.length) {
        await prisma.storyLabel.createMany({
          data: valid.map((l) => ({ storyId: story.id, labelId: l.id })),
          skipDuplicates: true,
        });
      }
    }
    await activityService.log({ storyId: story.id, actorId, event: 'created', toValue: story.key });
    if (story.parentStoryId) {
      await activityService.log({
        storyId: story.parentStoryId,
        actorId,
        event: 'subtask_added',
        toValue: story.key,
      });
    }
    // Reporter (and assignee, if set) implicitly watch the story they own —
    // no eye-click needed. This is what gives them "every update".
    await notificationService.ensureWatcher(story.id, story.reporterId);
    if (story.assigneeId) {
      await notificationService.ensureWatcher(story.id, story.assigneeId);
    }
    // Bind inline description media (uploaded with storyId = null) to the story.
    if (input.description) {
      await attachmentService.linkDescriptionAttachments(story.id, input.projectId, input.description);
    }
    return storyModel.findById(story.id);
  },

  async update(id: string, input: UpdateStoryInput, actorId: string) {
    const before = await storyModel.findById(id);
    if (!before) throw ErrorResponse.notFound('Story not found');
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      await assertAssigneeIsProjectMember(before.projectId, input.assigneeId);
    }
    // customFields is not a Story column — split it off before the Prisma
    // update and route it through the value upsert (which also logs activity).
    const { customFields, ...scalarInput } = input;
    const updated = await storyModel.update(id, scalarInput);
    if (customFields) {
      await customFieldService.applyValues(id, before.projectId, customFields, actorId);
    }
    // Bind any newly-referenced inline description media to this story (additive
    // — never unlinks, so gallery attachments are untouched).
    if (input.description !== undefined) {
      await attachmentService.linkDescriptionAttachments(
        id,
        before.projectId,
        scalarInput.description ?? null,
      );
    }

    // Fire-and-forget: activity logging + notification dispatch must not
    // block the HTTP response — a missed notification is an accepted trade
    // for a save that doesn't wait on email I/O. `.catch` keeps a failure
    // from surfacing as an unhandled promise rejection.
    void dispatchStoryUpdateNotifications(before, input, actorId).catch((err) =>
      logger.error('story update notifications failed', err),
    );

    return storyModel.findById(updated.id);
  },

  async changeStatus(id: string, nextStatus: StoryStatus, actorId: string) {
    const before = await storyModel.findById(id);
    if (!before) throw ErrorResponse.notFound('Story not found');
    if (before.status === nextStatus) return before;
    // Keep `statusId` in sync — null for backlog, the default column for the new
    // core otherwise. ALWAYS reassign (never leave a stale id from the old core)
    // so the dynamic-columns board places the card correctly.
    const statusId = await workflowService.defaultStatusId(before.projectId, nextStatus);
    await storyModel.update(id, { status: nextStatus, statusId });
    // Fire-and-forget: activity + notification must not block the response.
    void (async () => {
      const logEntry = await activityService.log({
        storyId: id,
        actorId,
        event: 'status_changed',
        fromValue: before.status,
        toValue: nextStatus,
        // Reference the workflow columns by id so the history resolves to their
        // CURRENT labels — a later rename then shows everywhere, not a snapshot.
        meta: { fromStatusId: before.statusId ?? null, toStatusId: statusId ?? null },
      });
      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      const label = nextStatus.replace(/_/g, ' ');
      // Phase 14: reaching `done` is a COMPLETION — tag it ticket_completed so
      // the email consults the completion opt-in and NOT status_changed too
      // (one event per transition → never two emails for the same move).
      const isCompletion = nextStatus === 'done';
      await notificationService.dispatch({
        storyId: id,
        storyKey: before.key,
        storyTitle: before.title,
        actorId,
        actorName: actor?.name ?? 'Someone',
        type: 'story_status_changed',
        title: `${actor?.name ?? 'Someone'} moved ${before.key} to ${label}`,
        body: before.title,
        emailHeadline: isCompletion ? 'completed this story' : `moved this story to ${label}`,
        projectId: before.projectId,
        projectEvent: isCompletion ? 'ticket_completed' : 'status_changed',
        // Activity-log id = stable per-transition dedupe token: distinct across
        // genuine re-transitions (done → reopen → done emails twice), identical
        // only if THIS dispatch re-runs (then the ledger blocks the double).
        dedupeToken: logEntry.id,
      });
    })().catch((err) => logger.error('story status-change notifications failed', err));

    return storyModel.findById(id);
  },

  /**
   * Move a story to a specific workflow column (custom or default). Used by
   * the board when dragging onto a custom column — passing only a coreStatus
   * can't disambiguate between two columns sharing the same underlying enum.
   */
  async changeStatusRow(
    id: string,
    statusRowId: string,
    actorId: string,
    opts: { cascadeSubtasks?: boolean } = {},
  ) {
    const before = await storyModel.findById(id);
    if (!before) throw ErrorResponse.notFound('Story not found');
    const row = await prisma.workflowStatus.findUnique({ where: { id: statusRowId } });
    if (!row || row.projectId !== before.projectId) {
      throw ErrorResponse.badRequest('Workflow column does not belong to this project');
    }
    await storyModel.update(id, { statusId: row.id, status: row.coreStatus });
    // Fire-and-forget: activity + notification must not block the response.
    void (async () => {
      if (before.status !== row.coreStatus) {
        const logEntry = await activityService.log({
          storyId: id,
          actorId,
          event: 'status_changed',
          fromValue: before.status,
          toValue: row.coreStatus,
          // Reference the exact workflow columns by id so history resolves to
          // their CURRENT labels (a rename reflects everywhere, not a snapshot).
          meta: { fromStatusId: before.statusId ?? null, toStatusId: row.id },
        });
        const actor = await prisma.user.findUnique({
          where: { id: actorId },
          select: { name: true },
        });
        // Phase 14: a done-CATEGORY column (including custom ones) is a
        // completion — tag ticket_completed, else status_changed. One per move.
        const isCompletion = row.category === 'done';
        await notificationService.dispatch({
          storyId: id,
          storyKey: before.key,
          storyTitle: before.title,
          actorId,
          actorName: actor?.name ?? 'Someone',
          type: 'story_status_changed',
          title: `${actor?.name ?? 'Someone'} moved ${before.key} to ${row.label}`,
          body: before.title,
          emailHeadline: isCompletion ? 'completed this story' : `moved this story to ${row.label}`,
          projectId: before.projectId,
          projectEvent: isCompletion ? 'ticket_completed' : 'status_changed',
          dedupeToken: logEntry.id,
        });
      }
    })().catch((err) => logger.error('story status-change notifications failed', err));

    // Cascade completion: when a PARENT is moved into a done-category column and
    // the caller opted in (the client's "move subtasks too" confirmation), drag
    // its still-open subtasks to the same column. Reuses this method per subtask
    // so each subtask gets its own activity entry + notification. Subtasks share
    // the parent's project, so `row.id` is a valid target column for them too;
    // subtasks can't nest, so there's no deeper recursion to guard against.
    if (opts.cascadeSubtasks && row.category === 'done') {
      const openSubtasks = (before.subtasks ?? []).filter((s) => s.status !== 'done');
      for (const sub of openSubtasks) {
        await storyService.changeStatusRow(sub.id, row.id, actorId);
      }
    }

    return storyModel.findById(id);
  },

  /**
   * Manual drag-reorder (Jira-style rank). Places the story between its new
   * neighbours `prevId` (the story now above it) and `nextId` (below it) — either
   * may be null at a list edge. Sets rank to the midpoint; if the neighbours are
   * adjacent (no room), rebalances the project's ranks first. Order is a single
   * global per-project sequence, so backlog and board stay consistent.
   */
  async reorder(id: string, prevId: string | null, nextId: string | null) {
    const story = await storyModel.findById(id);
    if (!story) throw ErrorResponse.notFound('Story not found');

    const ids = [prevId, nextId].filter((x): x is string => !!x);
    const neighbours = ids.length
      ? await prisma.story.findMany({
          where: { id: { in: ids }, projectId: story.projectId },
          select: { id: true, rank: true },
        })
      : [];
    const prev = prevId ? neighbours.find((s) => s.id === prevId) ?? null : null;
    const next = nextId ? neighbours.find((s) => s.id === nextId) ?? null : null;

    let newRank: number;
    if (prev && next) {
      if (next.rank - prev.rank > 1) {
        newRank = Math.floor((prev.rank + next.rank) / 2);
      } else {
        await rebalanceRanks(story.projectId, id, prevId);
        return storyModel.findById(id);
      }
    } else if (prev) {
      newRank = prev.rank + RANK_GAP;
    } else if (next) {
      newRank = next.rank - RANK_GAP;
    } else {
      return story; // no neighbours — nothing to do
    }

    await storyModel.update(id, { rank: newRank });
    return storyModel.findById(id);
  },

  async remove(id: string) {
    // Walk the subtree (parent → subtasks → grandchildren) so deletion takes
    // the whole tree with it. Schema has parentStoryId onDelete: SetNull, so
    // a plain prisma.story.delete would orphan subtasks; we explicitly
    // collect every descendant id and delete them together.
    const subtreeIds: string[] = [];
    const queue: string[] = [id];
    while (queue.length) {
      const layer = queue.splice(0, queue.length);
      subtreeIds.push(...layer);
      const children = await prisma.story.findMany({
        where: { parentStoryId: { in: layer } },
        select: { id: true },
      });
      if (children.length) queue.push(...children.map((c) => c.id));
    }

    // Capture every attachment file path BEFORE deletion — Prisma's cascade
    // wipes the Attachment rows when stories are deleted, after which we
    // could no longer find the disk paths to unlink.
    const storyAttachments = await prisma.attachment.findMany({
      where: { storyId: { in: subtreeIds } },
      select: { id: true, path: true },
    });

    // Stories generated from an image import keep a sourceImageImportId
    // pointer (onDelete: SetNull). Find any image imports that become
    // orphaned once the subtree is gone, so we can clean up the source
    // image file + ImageImport row alongside the story. If another story
    // outside the subtree still references the same import, we leave it.
    const subtreeStories = await prisma.story.findMany({
      where: { id: { in: subtreeIds } },
      select: { sourceImageImportId: true },
    });
    const referencedImportIds = [
      ...new Set(
        subtreeStories
          .map((s) => s.sourceImageImportId)
          .filter((v): v is string => !!v),
      ),
    ];

    const orphanImports: { importId: string; attachmentId: string; path: string }[] = [];
    for (const importId of referencedImportIds) {
      const otherRefs = await prisma.story.count({
        where: { sourceImageImportId: importId, id: { notIn: subtreeIds } },
      });
      if (otherRefs > 0) continue;
      const imp = await prisma.imageImport.findUnique({
        where: { id: importId },
        select: { attachment: { select: { id: true, path: true } } },
      });
      if (imp?.attachment) {
        orphanImports.push({
          importId,
          attachmentId: imp.attachment.id,
          path: imp.attachment.path,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Subtree delete: cascades wipe attachments, comments, worklogs,
      // activity, story links, etc. SetNull on the self-FK means deleting
      // the parent before children doesn't FK-fail; deleteMany handles
      // ordering internally.
      await tx.story.deleteMany({ where: { id: { in: subtreeIds } } });

      // Delete now-orphaned source image attachments. Cascade on
      // ImageImport.attachmentId removes the ImageImport row in lockstep.
      for (const o of orphanImports) {
        await tx.attachment.delete({ where: { id: o.attachmentId } }).catch((err) => {
          // The Attachment may have already cascaded out via the story
          // delete above (if its storyId pointed inside the subtree). That
          // would have also taken the ImageImport with it via Cascade — so
          // a P2025 here is fine, just means cleanup already happened.
          if ((err as { code?: string })?.code !== 'P2025') throw err;
        });
      }
    });

    // After commit, best-effort unlink files from disk. Storage adapter
    // already swallows ENOENT, so re-deletes / partial state are safe.
    const allPaths = [
      ...storyAttachments.map((a) => a.path),
      ...orphanImports.map((o) => o.path),
    ];
    await Promise.all(
      allPaths.map((p) =>
        storage.remove(p).catch((err) => {
          logger.warn(`failed to unlink attachment ${p}`, err);
        }),
      ),
    );

    return { ok: true, deletedStories: subtreeIds.length, deletedFiles: allPaths.length };
  },

  /**
   * Add a link between two stories. Creates both the user-chosen direction and
   * its inverse in one transaction so the graph is always consistent.
   * Returns the canonical (outgoing, from the source's perspective) link row.
   */
  async linkStories(input: {
    sourceId: string;
    targetId: string;
    type: LinkType;
    actorId: string;
  }) {
    if (input.sourceId === input.targetId) {
      throw ErrorResponse.badRequest('Cannot link a story to itself');
    }
    return prisma.$transaction(async (tx) => {
      const [source, target] = await Promise.all([
        tx.story.findUnique({ where: { id: input.sourceId } }),
        tx.story.findUnique({ where: { id: input.targetId } }),
      ]);
      if (!source) throw ErrorResponse.notFound('Source story not found');
      if (!target) throw ErrorResponse.notFound('Target story not found');
      if (source.projectId !== target.projectId) {
        throw ErrorResponse.badRequest('Stories must be in the same project');
      }

      const existing = await tx.storyLink.findUnique({
        where: {
          sourceId_targetId_type: {
            sourceId: input.sourceId,
            targetId: input.targetId,
            type: input.type,
          },
        },
      });
      if (existing) return existing;

      const link = await tx.storyLink.create({
        data: {
          sourceId: input.sourceId,
          targetId: input.targetId,
          type: input.type,
        },
      });
      await tx.storyLink.upsert({
        where: {
          sourceId_targetId_type: {
            sourceId: input.targetId,
            targetId: input.sourceId,
            type: LINK_INVERSE[input.type],
          },
        },
        update: {},
        create: {
          sourceId: input.targetId,
          targetId: input.sourceId,
          type: LINK_INVERSE[input.type],
        },
      });

      await tx.activityLog.create({
        data: {
          storyId: input.sourceId,
          actorId: input.actorId,
          event: 'linked',
          toValue: `${input.type}:${target.key}`,
        },
      });
      await tx.activityLog.create({
        data: {
          storyId: input.targetId,
          actorId: input.actorId,
          event: 'linked',
          toValue: `${LINK_INVERSE[input.type]}:${source.key}`,
        },
      });
      return link;
    });
  },

  /**
   * Remove a link + its inverse in one transaction.
   * `linkId` points at either direction — we resolve both and delete the pair.
   */
  async unlinkStories(linkId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const link = await tx.storyLink.findUnique({ where: { id: linkId } });
      if (!link) throw ErrorResponse.notFound('Link not found');

      const inverse = await tx.storyLink.findUnique({
        where: {
          sourceId_targetId_type: {
            sourceId: link.targetId,
            targetId: link.sourceId,
            type: LINK_INVERSE[link.type],
          },
        },
      });

      await tx.storyLink.delete({ where: { id: link.id } });
      if (inverse) await tx.storyLink.delete({ where: { id: inverse.id } });

      await tx.activityLog.create({
        data: {
          storyId: link.sourceId,
          actorId,
          event: 'unlinked',
          fromValue: `${link.type}:${link.targetId}`,
        },
      });
      return { ok: true };
    });
  },

  /**
   * Re-iterate a story from a completed sprint: clone its content into a new
   * backlog story and link the new story to the original via the
   * `reiterates` ↔ `reiterated_by` pair. The original story stays untouched
   * inside its completed sprint so velocity history isn't rewritten.
   */
  async reiterate(originalId: string, actorId: string) {
    const original = await storyModel.findById(originalId);
    if (!original) throw ErrorResponse.notFound('Story not found');

    const cloneInput: CreateStoryInput = {
      projectId: original.projectId,
      title: original.title,
      description: original.description ?? null,
      acceptanceCriteria: original.acceptanceCriteria ?? null,
      type: original.type,
      priority: original.priority,
      storyPoints: original.storyPoints ?? null,
      originalEstimateMinutes: original.originalEstimateMinutes ?? null,
      epicId: original.epicId ?? null,
      assigneeId: original.assigneeId ?? null,
      reporterId: actorId,
      parentStoryId: null,
    };
    const cloned = await this.create(cloneInput, actorId);
    if (!cloned) throw ErrorResponse.notFound('Clone failed');

    await this.linkStories({
      sourceId: cloned.id,
      targetId: original.id,
      type: 'reiterates',
      actorId,
    });
    return storyModel.findById(cloned.id);
  },

  async listLinks(storyId: string) {
    return prisma.storyLink.findMany({
      where: { sourceId: storyId },
      include: {
        target: {
          select: {
            id: true,
            key: true,
            title: true,
            status: true,
            statusId: true,
            type: true,
            priority: true,
            epic: { select: { id: true, key: true, title: true, color: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },
};
