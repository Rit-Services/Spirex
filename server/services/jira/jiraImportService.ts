// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import logger from '../../utils/logger.js';
import { workflowService } from '../workflow/workflowService.js';
import { attachmentService } from '../attachment/attachmentService.js';
import {
  jiraClient,
  type JiraCredentials,
  type JiraBoardColumn,
  type JiraProjectStatusInfo,
  type JiraIssue,
} from './jiraClient.js';
import {
  mapIssueType,
  mapPriority,
  mapStoryStatus,
  mapSprintStatus,
  mapEpicStatus,
  adfToMarkdown,
  collectMediaIds,
  extractStoryPoints,
  parseJiraDate,
  mapColumnToCoreStatus,
  categoryForCoreStatus,
  WORKFLOW_COLOR_BY_CORE,
} from './jiraMapper.js';
import { deriveKey, withSuffix } from '../../utils/projectKey.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import type { StatusCategory, StoryStatus } from '@prisma/client';

// ── Progress reporting ─────────────────────────────────────────────────────────
// The import is a single (potentially long) operation made of discrete phases.
// A caller can pass `onProgress` to receive a stream of weighted progress events
// — the controller forwards these over Server-Sent Events so the UI can show a
// real bar ("Importing issues… 240/812") instead of a blind spinner.

/** The ordered phases of an import; `done` is emitted once at the very end. */
export type ImportPhase =
  | 'setup' | 'workflow' | 'epics' | 'sprints' | 'issues' | 'subtasks' | 'attachments' | 'members' | 'done';

export interface ImportProgressEvent {
  phase: ImportPhase;
  /** Human label for the current phase (the UI may also derive its own). */
  message: string;
  /** Items processed so far within the phase (when the phase is countable). */
  current?: number;
  /** Total items in the phase (when known up-front). */
  total?: number;
  /** Overall progress across ALL phases, 0–100 (weighted, monotonic). */
  percent: number;
}

export type ProgressCallback = (e: ImportProgressEvent) => void;

interface ProgressReporter {
  /** Begin a phase with a known total; emits the phase's starting percent. */
  startPhase(phase: ImportPhase, total: number, message: string): void;
  /** Report progress within the current phase (throttled to whole-percent steps). */
  tick(current: number): void;
  /** Final 100% event. */
  done(message?: string): void;
}

const NOOP_REPORTER: ProgressReporter = {
  startPhase() {}, tick() {}, done() {},
};

/**
 * Build a reporter that maps per-phase progress onto an overall 0–100 bar using
 * a weighted plan (weights sum to 100). Each phase occupies `[start, start+span)`
 * of the bar; within a phase, percent interpolates by `current/total`. Ticks are
 * throttled to whole-percent changes so huge projects don't flood the stream.
 */
function makeReporter(
  onProgress: ProgressCallback | undefined,
  plan: Array<{ phase: ImportPhase; weight: number }>,
): ProgressReporter {
  if (!onProgress) return NOOP_REPORTER;

  const offsets = new Map<ImportPhase, { start: number; span: number }>();
  let acc = 0;
  for (const p of plan) {
    offsets.set(p.phase, { start: acc, span: p.weight });
    acc += p.weight;
  }

  let cur: { phase: ImportPhase; total: number; start: number; span: number; label: string } | null = null;
  let lastPercent = -1;

  return {
    startPhase(phase, total, message) {
      const o = offsets.get(phase) ?? { start: acc, span: 0 };
      cur = { phase, total, start: o.start, span: o.span, label: message };
      lastPercent = Math.round(o.start);
      onProgress({ phase, message, current: 0, total, percent: lastPercent });
    },
    tick(current) {
      if (!cur) return;
      const frac = cur.total > 0 ? Math.min(current / cur.total, 1) : 1;
      const percent = Math.round(cur.start + frac * cur.span);
      // Push only when the bar actually advances a whole percent, or on the last
      // item — keeps the SSE stream light while still moving smoothly.
      if (percent !== lastPercent || current >= cur.total) {
        lastPercent = percent;
        onProgress({ phase: cur.phase, message: cur.label, current, total: cur.total, percent });
      }
    },
    done(message = 'Import complete') {
      cur = null;
      onProgress({ phase: 'done', message, percent: 100 });
    },
  };
}

// Phase weights — issues dominate (the heavy, paged phase). Full-project import
// also creates the project + workflow + sprints; ticket import skips those.
const PROJECT_PLAN: Array<{ phase: ImportPhase; weight: number }> = [
  { phase: 'setup',       weight: 3  },
  { phase: 'workflow',    weight: 6  },
  { phase: 'epics',       weight: 12 },
  { phase: 'sprints',     weight: 5  },
  { phase: 'issues',      weight: 40 },
  { phase: 'subtasks',    weight: 9  },
  { phase: 'attachments', weight: 20 },
  { phase: 'members',     weight: 5  },
];

const TICKETS_PLAN: Array<{ phase: ImportPhase; weight: number }> = [
  { phase: 'setup',       weight: 3  },
  { phase: 'epics',       weight: 18 },
  { phase: 'issues',      weight: 45 },
  { phase: 'subtasks',    weight: 9  },
  { phase: 'attachments', weight: 20 },
  { phase: 'members',     weight: 5  },
];

/**
 * A workflow column we plan to create from a JIRA board, before it's persisted.
 * Shared by the preview (display) and the real import (creation) so both agree
 * exactly on how JIRA columns map to RitJira core statuses.
 */
interface PlannedColumn {
  name: string;
  core: StoryStatus;
  category: StatusCategory;
  statusNames: string[];
}

/** Pure mapping: JIRA board columns → planned RitJira workflow columns. */
function planWorkflowColumns(
  columns: JiraBoardColumn[],
  statusById: Map<string, JiraProjectStatusInfo>,
): PlannedColumn[] {
  return columns.map((column) => {
    const colStatuses = (column.statuses ?? [])
      .map((s) => statusById.get(s.id))
      .filter((s): s is JiraProjectStatusInfo => Boolean(s));
    const categoryKey = colStatuses[0]?.statusCategory?.key ?? '';
    const core = mapColumnToCoreStatus(column.name, categoryKey);
    return {
      name: column.name,
      core,
      category: categoryForCoreStatus(core),
      statusNames: colStatuses.map((s) => s.name),
    };
  });
}

/**
 * Resolves a JIRA status (name + category) to a RitJira core status and the
 * workflow column (statusId) a story should land in. Built either from an
 * imported JIRA board (full-project import) or from an existing project's own
 * workflow rows (ticket import into an existing project).
 */
interface WorkflowResolution {
  /** True when the workflow was recreated from a JIRA board configuration. */
  imported: boolean;
  /** Ordered column labels — surfaced in the import result for confirmation. */
  columnNames: string[];
  /** Resolve a JIRA status to a core enum + the column it belongs to. */
  resolve(jiraStatusName: string, jiraCategoryKey: string): { status: StoryStatus; statusId: string | null };
  /** Best column id for a core status — used when nudging backlog→todo. */
  rowForCore(core: StoryStatus): string | null;
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface ImportTicketsOptions {
  creds: JiraCredentials;
  jiraProjectKey: string;
  targetProjectId: string;   // existing RitJira project
  actorId: string;
  /** Optional: receive weighted progress events as the import runs. */
  onProgress?: ProgressCallback;
}

export interface ImportFullProjectOptions {
  creds: JiraCredentials;
  jiraProjectKey: string;
  jiraProjectName: string;
  actorId: string;
  // Phase 13: home organization for the imported project (from req.orgContext).
  // Without this the project is created org-less and is invisible in the console.
  organizationId: string;
  /** Optional: receive weighted progress events as the import runs. */
  onProgress?: ProgressCallback;
}

export interface ImportPreviewResult {
  epicCount: number;
  sprintCount: number;
  issueCount: number;
  /** Total files attached across all non-epic issues — all will be imported. */
  attachmentCount: number;
  unmatchedUsers: Array<{ email: string; displayName: string }>;
  /** People found in the JIRA project who DO match a RitJira user by email —
   *  these will be linked on their issues and added to the project as members. */
  matchedUsers: Array<{ email: string; displayName: string }>;
  /** Debug: EVERY person found in JIRA (issue assignees/reporters + assignable
   *  roster) with the email JIRA actually returned (often null on Cloud) and
   *  whether it matched a RitJira account. */
  peopleFound: Array<{
    displayName: string;
    email: string | null;
    accountId: string | null;
    roles: string[];
    matched: boolean;
    /** Which signal matched: 'email' (strong), 'name' (fuzzy fallback), or null. */
    matchMethod: 'email' | 'name' | null;
  }>;
  /** Planned workflow columns with the core status + JIRA statuses each holds. */
  workflowPlan: Array<{ name: string; coreStatus: string; category: string; statuses: string[] }>;
  /** Ordered workflow column names that will be recreated from the JIRA board. */
  workflowColumns: string[];
  /** The project key a full-project import would create — the original JIRA key
   *  when free, otherwise a suffixed one. (Only meaningful for project mode.) */
  projectKey: string;
  /** True when the JIRA key was already taken and a new key was assigned. */
  projectKeyChanged: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** How a JIRA person was resolved to a RitJira user — surfaced for transparency. */
type MatchMethod = 'email' | 'name' | null;

interface UserMatcher {
  /** Resolve to a RitJira user id, trying email first then display name. */
  resolve(email: string | null | undefined, displayName: string | null | undefined): string | null;
  /** Same, but also reports which signal matched (for the debug preview). */
  resolveWithMethod(
    email: string | null | undefined,
    displayName: string | null | undefined,
  ): { userId: string | null; method: MatchMethod };
}

/**
 * Load every RitJira user once and build in-memory lookup maps:
 *   - by email (lower-cased) — the strong, unambiguous signal.
 *   - by display name (lower-cased) — the fuzzy fallback for when JIRA hides
 *     emails. A name shared by two RitJira users is marked AMBIGUOUS (null) and
 *     never matched, so we never assign issues to the wrong person.
 * Doing this once avoids a DB round-trip per issue and keeps matching consistent.
 */
async function buildUserMatcher(): Promise<UserMatcher> {
  // Exclude external/ghost users — they carry a real person's NAME, so leaving
  // them in would let a ghost shadow the name-fallback and match incoming JIRA
  // people to a previous import's tag instead of the real account.
  const users = await prisma.user.findMany({
    where: { isExternal: false },
    select: { id: true, email: true, name: true },
  });

  const byEmail = new Map<string, string>();
  // value `null` ⇒ the name is ambiguous (≥2 RitJira users) ⇒ don't match.
  const byName = new Map<string, string | null>();

  for (const u of users) {
    if (u.email) {
      const k = u.email.trim().toLowerCase();
      if (!byEmail.has(k)) byEmail.set(k, u.id);
    }
    if (u.name) {
      const k = u.name.trim().toLowerCase();
      byName.set(k, byName.has(k) ? null : u.id);
    }
  }

  const matcher: UserMatcher = {
    resolveWithMethod(email, displayName) {
      const e = email?.trim().toLowerCase();
      if (e) {
        const hit = byEmail.get(e);
        if (hit) return { userId: hit, method: 'email' };
      }
      const n = displayName?.trim().toLowerCase();
      if (n) {
        const hit = byName.get(n); // undefined = unknown, null = ambiguous, string = unique
        if (hit) return { userId: hit, method: 'name' };
      }
      return { userId: null, method: null };
    },
    resolve(email, displayName) {
      return matcher.resolveWithMethod(email, displayName).userId;
    },
  };

  return matcher;
}

/** A JIRA person as it appears on an issue/comment (assignee/reporter/author). */
type JiraPerson = { accountId?: string; emailAddress?: string; displayName: string } | null | undefined;

/** Find-or-create the external/ghost user for a JIRA person (null if no person). */
type GhostResolver = (person: JiraPerson) => Promise<string | null>;

/**
 * Resolves a JIRA person to an "external/ghost" Spirex user — a name-only tag
 * (shown as "Name (unlinked)") used to attribute imported work truthfully when
 * the person doesn't map to a real account. Ghosts never log in (disabledAt +
 * synthetic email + unusable password), hold NO membership and consume NO seat.
 *
 * Find-or-create keyed by JIRA accountId so re-imports (and repeated references
 * within one import) reuse the same ghost instead of duplicating. An in-memory
 * cache avoids a DB round-trip per reference. Returns null only when there's no
 * person at all (caller then leaves the field empty / falls back to the actor).
 */
function makeGhostResolver() {
  const cache = new Map<string, string>(); // dedup key → ghost userId

  return async (person: JiraPerson): Promise<string | null> => {
    if (!person || (!person.accountId && !person.displayName)) return null;
    const key = person.accountId ?? `name:${person.displayName.trim().toLowerCase()}`;

    const cached = cache.get(key);
    if (cached) return cached;

    // Reuse an existing ghost for this JIRA account across imports.
    let ghost = person.accountId
      ? await prisma.user.findFirst({
          where: { externalSource: 'jira', externalId: person.accountId },
          select: { id: true },
        })
      : null;

    if (!ghost) {
      // Synthetic, never-displayed email satisfies the unique/non-null column.
      // We deliberately do NOT store the real JIRA email (truthful name only).
      const slug = person.accountId ?? crypto.randomBytes(8).toString('hex');
      ghost = await prisma.user.create({
        data: {
          name: person.displayName || 'Unknown (JIRA)',
          email: `jira-${slug}@unlinked.local`,
          passwordHash: '!external', // not a valid hash → password login impossible
          isExternal: true,
          externalSource: 'jira',
          externalId: person.accountId ?? null,
          disabledAt: new Date(), // belt-and-suspenders: every disabledAt filter excludes it
        },
        select: { id: true },
      });
    }

    cache.set(key, ghost.id);
    return ghost.id;
  };
}

/**
 * Add email-matched JIRA users to the project as developers. The importer is
 * already a member (lead) and is skipped; anyone who is already a member keeps
 * their existing role (we never downgrade). Returns how many were newly linked.
 */
async function ensureProjectMembers(
  projectId: string,
  userIds: string[],
  actorId: string,
): Promise<number> {
  const ids = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (ids.length === 0) return 0;

  const existing = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: ids } },
    select: { userId: true },
  });
  const existingSet = new Set(existing.map((m) => m.userId));
  const toCreate = ids.filter((id) => !existingSet.has(id));
  if (toCreate.length === 0) return 0;

  await prisma.projectMember.createMany({
    data: toCreate.map((userId) => ({ projectId, userId, projectRole: 'developer' as const })),
    skipDuplicates: true,
  });
  return toCreate.length;
}

/**
 * Recreate a JIRA board's workflow as RitJira WorkflowStatus rows. Reads the
 * first board's column configuration (the ordered columns the user sees in
 * JIRA) and the project's statuses, then builds one column per board column,
 * pinned to a core enum value. Returns a resolver that maps each JIRA status to
 * the column a story should land in — or null when the project has no board
 * (caller falls back to the default workflow).
 */
async function importWorkflow(
  creds: JiraCredentials,
  jiraProjectKey: string,
  targetProjectId: string,
): Promise<WorkflowResolution | null> {
  const boards = await jiraClient.listBoards(creds, jiraProjectKey).catch(() => []);
  if (!boards.length) return null;

  const config = await jiraClient.getBoardConfiguration(creds, boards[0].id).catch(() => null);
  const columns = config?.columnConfig?.columns ?? [];
  if (!columns.length) return null;

  const statuses = await jiraClient.listProjectStatuses(creds, jiraProjectKey).catch(() => []);
  const statusById = new Map(statuses.map((s) => [s.id, s] as const));
  const planned = planWorkflowColumns(columns, statusById);

  // jiraStatusName(lower) → { rowId, coreStatus }; and core → first row id.
  const statusNameToRow = new Map<string, { rowId: string; coreStatus: StoryStatus }>();
  const coreToRow = new Map<StoryStatus, string>();

  let order = 0;
  for (const column of planned) {
    // First column for a given core becomes its default row, so the system
    // always has an `isDefault` fallback per core (storyService.changeStatus
    // relies on it) even when several columns share a core enum.
    const isFirstForCore = !coreToRow.has(column.core);
    const row = await prisma.workflowStatus.create({
      data: {
        projectId: targetProjectId,
        coreStatus: column.core,
        label: column.name,
        color: WORKFLOW_COLOR_BY_CORE[column.core],
        order: order++,
        category: column.category,
        isDefault: isFirstForCore,
      },
    });
    if (isFirstForCore) coreToRow.set(column.core, row.id);

    for (const statusName of column.statusNames) {
      const key = statusName.toLowerCase();
      if (!statusNameToRow.has(key)) statusNameToRow.set(key, { rowId: row.id, coreStatus: column.core });
    }
  }

  return {
    imported: true,
    columnNames: planned.map((c) => c.name),
    resolve(name, categoryKey) {
      const hit = statusNameToRow.get(name.toLowerCase());
      if (hit) return { status: hit.coreStatus, statusId: hit.rowId };
      // Status not on the board (e.g. a retired status still on old issues) —
      // fall back to a name/category guess, pinned to that core's column.
      const core = mapStoryStatus(categoryKey, name);
      return { status: core, statusId: coreToRow.get(core) ?? null };
    },
    rowForCore: (core) => coreToRow.get(core) ?? null,
  };
}

/**
 * Build a resolver from an EXISTING project's workflow rows. Used when importing
 * tickets into a project that already has its own columns — we never overwrite
 * that workflow, just route each imported story onto the matching column.
 */
async function existingProjectWorkflow(targetProjectId: string): Promise<WorkflowResolution> {
  const rows = await workflowService.list(targetProjectId);
  const coreToRow = new Map<StoryStatus, string>();
  // Prefer the default row for each core, then any remaining row as a fallback.
  for (const r of rows) if (r.isDefault && !coreToRow.has(r.coreStatus)) coreToRow.set(r.coreStatus, r.id);
  for (const r of rows) if (!coreToRow.has(r.coreStatus)) coreToRow.set(r.coreStatus, r.id);

  return {
    imported: false,
    columnNames: rows.map((r) => r.label),
    resolve(name, categoryKey) {
      const core = mapStoryStatus(categoryKey, name);
      return { status: core, statusId: coreToRow.get(core) ?? null };
    },
    rowForCore: (core) => coreToRow.get(core) ?? null,
  };
}

async function uniqueProjectKey(base: string): Promise<string> {
  // Normalise to a valid key shape once, then reuse it for any numeric suffix
  // so "KW" → "KW2" → "KW3" stays consistent on collision.
  const cleaned = base.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'IMP';
  let key = cleaned;
  let attempt = 1;
  while (await prisma.project.findFirst({ where: { key } })) {
    attempt++;
    if (attempt > 50) throw ErrorResponse.conflict('Could not find an available project key');
    key = withSuffix(cleaned, attempt);
  }
  return key;
}

const ISSUE_FIELDS = [
  'summary', 'description', 'issuetype', 'status', 'priority',
  'assignee', 'reporter', 'customfield_10016', 'customfield_10028',
  'parent', 'subtasks', 'created', 'updated',
  'attachment',         // issue files + inline-image media (id matches ADF media)
  'comment',            // issue comments (paginated set; rest fetched if truncated)
  'customfield_10014',  // Epic Link (classic)
  'customfield_10020',  // Sprint (next-gen)
  'customfield_10010',  // Sprint (classic)
];

// Lean field set for the PREVIEW — counts + people + epic links + attachment
// count only. Deliberately omits `comment`/`description` so previewing a big
// project doesn't pull every comment body just to tally numbers. The JQL is the
// same, so issueCount still matches the real import exactly.
const PREVIEW_FIELDS = [
  'assignee', 'reporter', 'attachment',
  'parent', 'customfield_10014',
];

/** A file we couldn't pull from JIRA — surfaced in the result, never fatal. */
export interface AttachmentFailure {
  issueKey: string;
  filename: string;
  reason: string;
}

/**
 * Import every attachment on a JIRA issue into Spirex storage, linked to a
 * story (or to the project when `storyId` is null — used for epics, which have
 * no attachment relation). Returns a map of JIRA attachment id → stored
 * attachment id so the caller can rewrite inline-image references in the
 * description. Each file is downloaded and written ONE AT A TIME to keep peak
 * memory to a single file; per-file failures are isolated and recorded.
 */
async function importAttachments(
  creds: JiraCredentials,
  issue: JiraIssue,
  projectId: string,
  storyId: string | null,
  matcher: UserMatcher,
  ghostFor: GhostResolver,
  actorId: string,
  failures: AttachmentFailure[],
  onEach: () => void,
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  for (const att of issue.fields.attachment ?? []) {
    try {
      const buffer = await jiraClient.downloadAttachment(creds, att.content);
      // Truthful uploader, same chain as comments/epics/stories: real match →
      // that user; unmatched person → a (unlinked) ghost; genuinely authorless
      // → the importer as a last resort.
      const uploadedById =
        matcher.resolve(att.author?.emailAddress, att.author?.displayName) ??
        (await ghostFor(att.author)) ??
        actorId;
      const rec = await attachmentService.create({
        projectId,
        storyId: storyId ?? undefined,
        uploadedById,
        filename: att.filename,
        mimetype: att.mimeType,
        buffer,
        createdAt: parseJiraDate(att.created) ?? undefined,
      });
      idMap.set(att.id, rec.id);
    } catch (e) {
      failures.push({
        issueKey: issue.key,
        filename: att.filename,
        reason: e instanceof Error ? e.message : 'unknown error',
      });
    } finally {
      onEach();
    }
  }
  return idMap;
}

/**
 * Build a media resolver that rewrites ADF `media` node ids to the served URL of
 * their imported attachment copy. Shared by description + comment rendering.
 */
function mediaResolver(idMap: Map<string, string>) {
  return (mediaId: string): string | null => {
    const recId = idMap.get(mediaId);
    return recId ? `/api/attachments/${recId}/file` : null;
  };
}

/**
 * After an issue's attachments are imported, re-render its description so any
 * inline `media` nodes point at the stored copies (served via /api/attachments).
 * Returns the rewritten markdown, or null when nothing needs changing.
 */
function rewriteInlineImages(
  description: unknown,
  idMap: Map<string, string>,
): string | null {
  const mediaIds = collectMediaIds(description);
  if (mediaIds.length === 0) return null;
  const hasMapped = mediaIds.some((id) => idMap.has(id));
  if (!hasMapped) return null;
  return adfToMarkdown(description, mediaResolver(idMap));
}

/**
 * Import every comment on a JIRA issue onto its imported story. Bodies are
 * converted ADF→markdown with inline images rewritten to stored copies (same
 * media map as the description). Author + original timestamp are preserved.
 * Created directly (not via commentService) so a bulk import never fires
 * notifications/activity. The search endpoint returns a PAGE of comments; if the
 * issue has more than one page we fetch the full set so none are dropped.
 */
async function importComments(
  creds: JiraCredentials,
  issue: JiraIssue,
  storyId: string,
  matcher: UserMatcher,
  ghostFor: GhostResolver,
  actorId: string,
  idMap: Map<string, string>,
): Promise<number> {
  const container = issue.fields.comment;
  if (!container) return 0;

  let comments = container.comments ?? [];
  if (container.total != null && container.total > comments.length) {
    comments = await jiraClient.getIssueComments(creds, issue.key).catch(() => comments);
  }

  const resolve = mediaResolver(idMap);
  let count = 0;
  for (const c of comments) {
    const body = adfToMarkdown(c.body, resolve);
    if (!body || !body.trim()) continue; // skip empty/whitespace-only comments
    // Real match → that user; unmatched person → a truthful (unlinked) ghost;
    // genuinely authorless → the importer as a last resort.
    const authorId =
      matcher.resolve(c.author?.emailAddress, c.author?.displayName) ??
      (await ghostFor(c.author)) ??
      actorId;
    await prisma.comment.create({
      data: {
        story: { connect: { id: storyId } },
        author: { connect: { id: authorId } },
        body,
        ...(parseJiraDate(c.created) ? { createdAt: parseJiraDate(c.created)! } : {}),
      },
    });
    count++;
  }
  return count;
}

interface JiraSprintRef {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  completeDate?: string;
  endDate?: string;
}

/**
 * Pick the sprint an issue should land in. JIRA stores sprint history as an
 * array — an issue can have been in many sprints (rolled over). We pick:
 *   - For DONE issues: the last CLOSED sprint (where it was actually completed)
 *   - Otherwise: the ACTIVE sprint, falling back to the most recent sprint
 */
function pickRelevantSprint(
  sprints: JiraSprintRef[] | null | undefined,
  isDone: boolean,
): JiraSprintRef | null {
  if (!sprints || sprints.length === 0) return null;

  if (isDone) {
    const closed = sprints
      .filter((s) => s.state === 'closed')
      .sort((a, b) => {
        const da = a.completeDate ?? a.endDate ?? '';
        const db = b.completeDate ?? b.endDate ?? '';
        return db.localeCompare(da);
      });
    if (closed.length > 0) return closed[0];
  }

  const active = sprints.find((s) => s.state === 'active');
  if (active) return active;

  // Fallback — most recent by end/complete date, else last in array
  const sorted = [...sprints].sort((a, b) => {
    const da = a.completeDate ?? a.endDate ?? '';
    const db = b.completeDate ?? b.endDate ?? '';
    return db.localeCompare(da);
  });
  return sorted[0] ?? sprints[sprints.length - 1];
}

// ── Preview ────────────────────────────────────────────────────────────────────

export async function previewImport(
  creds: JiraCredentials,
  jiraProjectKey: string,
): Promise<ImportPreviewResult> {
  const [issues, epicIssues, boards, roster] = await Promise.all([
    jiraClient.searchIssues(creds, `project = "${jiraProjectKey}" AND issuetype != Epic ORDER BY created ASC`, PREVIEW_FIELDS),
    // Count epics the SAME way importEpics creates them — every issue of type
    // Epic, including ones with no child issues. (The old "epics referenced by a
    // child" tally under-counted childless epics, so the preview read low.)
    jiraClient.searchIssues(creds, `project = "${jiraProjectKey}" AND issuetype = Epic ORDER BY created ASC`, ['summary']),
    jiraClient.listBoards(creds, jiraProjectKey).catch(() => []),
    jiraClient.listAssignableUsers(creds, jiraProjectKey),
  ]);

  let sprintCount = 0;
  let workflowPlan: PlannedColumn[] = [];
  for (const board of boards.slice(0, 1)) {
    const [sprints, config, statuses] = await Promise.all([
      jiraClient.listSprints(creds, board.id).catch(() => []),
      jiraClient.getBoardConfiguration(creds, board.id).catch(() => null),
      jiraClient.listProjectStatuses(creds, jiraProjectKey).catch(() => []),
    ]);
    sprintCount = sprints.length;
    const columns = config?.columnConfig?.columns ?? [];
    const statusById = new Map(statuses.map((s) => [s.id, s] as const));
    workflowPlan = planWorkflowColumns(columns, statusById);
  }

  // Gather EVERY person JIRA exposes — issue assignees/reporters plus the
  // assignable roster — deduped by DISPLAY NAME (case-insensitive). Two JIRA
  // accounts sharing a name collapse into one, first occurrence wins, matching
  // how the import will treat them. Issues are scanned before the roster so the
  // "first come" is a real person who actually worked an issue.
  interface FoundPerson { displayName: string; email: string | null; accountId: string | null; roles: Set<string> }
  const peopleMap = new Map<string, FoundPerson>();
  const addPerson = (
    person: { accountId?: string; emailAddress?: string; displayName: string } | null | undefined,
    role: string,
  ) => {
    if (!person?.displayName) return;
    const key = person.displayName.trim().toLowerCase();
    const existing = peopleMap.get(key);
    if (existing) {
      existing.roles.add(role);
      // First non-null email wins (first-come-first-served), but capture one if
      // the first occurrence had none — any email improves matching.
      if (!existing.email && person.emailAddress) existing.email = person.emailAddress;
    } else {
      peopleMap.set(key, {
        displayName: person.displayName,
        email: person.emailAddress ?? null,
        accountId: person.accountId ?? null,
        roles: new Set([role]),
      });
    }
  };
  for (const issue of issues) {
    addPerson(issue.fields.assignee, 'assignee');
    addPerson(issue.fields.reporter, 'reporter');
  }
  for (const user of roster) addPerson(user, 'member');

  const matcher = await buildUserMatcher();

  // Resolve matches (email first, name fallback) and split into the matched /
  // unmatched lists the import uses, plus the full debug roster.
  const matched: Array<{ email: string; displayName: string }> = [];
  const unmatched: Array<{ email: string; displayName: string }> = [];
  const peopleFound: ImportPreviewResult['peopleFound'] = [];
  for (const p of peopleMap.values()) {
    const { userId, method } = matcher.resolveWithMethod(p.email, p.displayName);
    const isMatched = Boolean(userId);
    peopleFound.push({
      displayName: p.displayName,
      email: p.email,
      accountId: p.accountId,
      roles: [...p.roles],
      matched: isMatched,
      matchMethod: method,
    });
    if (isMatched) matched.push({ email: p.email ?? '', displayName: p.displayName });
    else unmatched.push({ email: p.email ?? '', displayName: p.displayName });
  }
  // Sort: email matches first, then name matches, then unmatched — alphabetical.
  const rank = (m: 'email' | 'name' | null) => (m === 'email' ? 0 : m === 'name' ? 1 : 2);
  peopleFound.sort((a, b) =>
    rank(a.matchMethod) - rank(b.matchMethod) ||
    a.displayName.localeCompare(b.displayName),
  );

  // Resolve the project key the same way the real import will: keep the JIRA
  // key when free, suffix on collision. Informational here — the import re-runs
  // this authoritatively, so a key taken in between is still handled.
  const cleanedPreferred = jiraProjectKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'IMP';
  const projectKey = await uniqueProjectKey(jiraProjectKey.trim() || 'IMP');
  const projectKeyChanged = projectKey !== cleanedPreferred;

  const attachmentCount = issues.reduce(
    (sum, issue) => sum + (issue.fields.attachment?.length ?? 0),
    0,
  );

  return {
    epicCount: epicIssues.length,
    sprintCount,
    issueCount: issues.length,
    attachmentCount,
    unmatchedUsers: unmatched,
    matchedUsers: matched,
    peopleFound,
    workflowPlan: workflowPlan.map((c) => ({
      name: c.name,
      coreStatus: c.core,
      category: c.category,
      statuses: c.statusNames,
    })),
    workflowColumns: workflowPlan.map((c) => c.name),
    projectKey,
    projectKeyChanged,
  };
}

// ── Core import logic ─────────────────────────────────────────────────────────

// Epic accent palette — mirrors the EPIC_COLORS picker in the EpicDialog so
// imported epics look native. Imported epics get distinct colors instead of all
// sharing the old hardcoded Jira blue.
const EPIC_COLORS = [
  '#0052CC', '#00875A', '#6554C0', '#DE350B', '#FF8B00',
  '#00B8D9', '#FFAB00', '#5243AA', '#36B37E',
];

async function importEpics(
  creds: JiraCredentials,
  jiraProjectKey: string,
  targetProjectId: string,
  actorId: string,
  matcher: UserMatcher,
  ghostFor: GhostResolver,
  attachmentFailures: AttachmentFailure[],
  reporter: ProgressReporter = NOOP_REPORTER,
): Promise<Map<string, string>> {
  // jiraKey → local epicId
  const epicMap = new Map<string, string>();

  const epicIssues = await jiraClient.searchIssues(
    creds,
    `project = "${jiraProjectKey}" AND issuetype = Epic ORDER BY created ASC`,
    ['summary', 'description', 'status', 'customfield_10014', 'attachment', 'reporter'],
  );

  const project = await prisma.project.findUnique({ where: { id: targetProjectId } });
  if (!project) throw ErrorResponse.notFound('Target project not found');

  reporter.startPhase('epics', epicIssues.length, 'Importing epics…');

  // Random starting offset so different imports vary, then cycle sequentially
  // so every epic in THIS import gets a different color (no two adjacent same).
  const colorStart = Math.floor(Math.random() * EPIC_COLORS.length);
  let epicIndex = 0;

  for (const issue of epicIssues) {
    const n = (await prisma.project.findUnique({ where: { id: targetProjectId }, select: { nextEpicNumber: true } }))!.nextEpicNumber;
    await prisma.project.update({ where: { id: targetProjectId }, data: { nextEpicNumber: n + 1 } });

    // Truthful creator: real match → that user; unmatched → (unlinked) ghost;
    // no reporter at all → the importer.
    const creatorId =
      matcher.resolve(issue.fields.reporter?.emailAddress, issue.fields.reporter?.displayName) ??
      (await ghostFor(issue.fields.reporter)) ??
      actorId;

    const epic = await prisma.epic.create({
      data: {
        projectId: targetProjectId,
        key: `${project.key}-E${n}`,
        title: issue.fields.summary,
        description: adfToMarkdown(issue.fields.description),
        color: EPIC_COLORS[(colorStart + epicIndex) % EPIC_COLORS.length],
        status: mapEpicStatus(issue.fields.status?.statusCategory?.key ?? 'new'),
        createdById: creatorId,
      },
    });
    epicMap.set(issue.key, epic.id);

    // Epics have no attachment relation, so their files land at project level.
    // Inline images in the epic description are then rewritten to the stored
    // copies so the description still renders.
    if (issue.fields.attachment?.length) {
      const idMap = await importAttachments(
        creds, issue, targetProjectId, null, matcher, ghostFor, actorId, attachmentFailures, () => {},
      );
      const rewritten = rewriteInlineImages(issue.fields.description, idMap);
      if (rewritten) {
        await prisma.epic.update({ where: { id: epic.id }, data: { description: rewritten } });
      }
    }

    epicIndex++;
    reporter.tick(epicIndex);
  }

  return epicMap;
}

async function importSprints(
  creds: JiraCredentials,
  jiraProjectKey: string,
  targetProjectId: string,
  actorId: string,
  reporter: ProgressReporter = NOOP_REPORTER,
): Promise<Map<number, string>> {
  // jiraSprintId → local sprintId
  const sprintMap = new Map<number, string>();

  const boards = await jiraClient.listBoards(creds, jiraProjectKey).catch(() => []);
  if (!boards.length) return sprintMap;

  const board = boards[0];
  const sprints = await jiraClient.listSprints(creds, board.id).catch(() => []);

  const project = await prisma.project.findUnique({ where: { id: targetProjectId } });
  if (!project) return sprintMap;

  reporter.startPhase('sprints', sprints.length, 'Importing sprints…');
  let sprintIndex = 0;

  for (const jiraSprint of sprints) {
    const n = (await prisma.project.findUnique({ where: { id: targetProjectId }, select: { nextSprintNumber: true } }))!.nextSprintNumber;
    await prisma.project.update({ where: { id: targetProjectId }, data: { nextSprintNumber: n + 1 } });

    const sprint = await prisma.sprint.create({
      data: {
        projectId: targetProjectId,
        name: jiraSprint.name || `${project.key} Sprint ${n}`,
        goal: jiraSprint.goal ?? null,
        status: mapSprintStatus(jiraSprint.state),
        startDate: parseJiraDate(jiraSprint.startDate),
        endDate: parseJiraDate(jiraSprint.endDate),
        createdById: actorId,
      },
    });
    sprintMap.set(jiraSprint.id, sprint.id);
    sprintIndex++;
    reporter.tick(sprintIndex);
  }

  return sprintMap;
}

async function importIssues(
  creds: JiraCredentials,
  jiraProjectKey: string,
  targetProjectId: string,
  epicMap: Map<string, string>,
  sprintMap: Map<number, string>,
  actorId: string,
  workflow: WorkflowResolution,
  matcher: UserMatcher,
  ghostFor: GhostResolver,
  attachmentFailures: AttachmentFailure[],
  reporter: ProgressReporter = NOOP_REPORTER,
): Promise<{
  imported: number;
  skipped: number;
  subtasksReparented: number;
  matchedUserIds: string[];
  attachmentsImported: number;
  commentsImported: number;
}> {
  const project = await prisma.project.findUnique({ where: { id: targetProjectId } });
  if (!project) throw ErrorResponse.notFound('Target project not found');

  // Fetch all non-epic issues
  const issues = await jiraClient.searchIssues(
    creds,
    `project = "${jiraProjectKey}" AND issuetype != Epic ORDER BY created ASC`,
    ISSUE_FIELDS,
  );

  // Total is known up-front (issues are fetched in one go) so the 'issues' phase
  // can show a real "240/812" counter as stories are created.
  reporter.startPhase('issues', issues.length, 'Importing issues…');

  // jiraKey → imported story metadata. We keep sprint/epic so a sub-task can
  // inherit its parent's sprint+epic (JIRA counts sub-tasks as sprint work
  // items; without this they'd vanish from the sprint and the totals wouldn't
  // match JIRA).
  interface StoryMeta { id: string; sprintId: string | null; epicId: string | null }
  const storyMap = new Map<string, StoryMeta>();
  // sub-tasks to process after parents exist
  const subtasks: typeof issues = [];
  // Every RitJira user we touch as assignee/reporter — added as project members.
  const matchedUserIds = new Set<string>();

  // ── Issue-number preservation ────────────────────────────────────────────
  // Keep JIRA's issue number so KW-42 imports as "<projectKey>-42" even when the
  // project key was suffixed (KW→KW2). We allocate from JIRA's number when it's
  // free; on collision (ticket import into a project that already uses that
  // number) or an unparseable key we fall back to the next free number. The
  // project's nextStoryNumber is advanced ONCE at the end (not per row).
  const numFromKey = (k: string): number | null => {
    const m = /-(\d+)$/.exec(k);
    return m ? parseInt(m[1], 10) : null;
  };
  const usedNumbers = new Set<number>();
  const existingStories = await prisma.story.findMany({
    where: { projectId: targetProjectId },
    select: { key: true },
  });
  for (const s of existingStories) {
    const num = numFromKey(s.key);
    if (num != null) usedNumbers.add(num);
  }
  let fallbackSeq = 0;
  const allocateNumber = (jiraKey: string): number => {
    const jiraNum = numFromKey(jiraKey);
    if (jiraNum != null && !usedNumbers.has(jiraNum)) {
      usedNumbers.add(jiraNum);
      return jiraNum;
    }
    do { fallbackSeq++; } while (usedNumbers.has(fallbackSeq));
    usedNumbers.add(fallbackSeq);
    return fallbackSeq;
  };

  let imported = 0;
  // Lossless import: sub-tasks with an unresolved parent are re-homed as
  // top-level (counted in subtasksReparented), never skipped. Kept at 0 for
  // API/UI compatibility.
  const skipped = 0;
  let subtasksReparented = 0;
  let scanned = 0;

  // First pass — create top-level stories
  for (const issue of issues) {
    scanned++;
    reporter.tick(scanned);
    const typeName = issue.fields.issuetype.name;
    const isSubtask = typeName.toLowerCase().includes('sub-task') || typeName.toLowerCase() === 'subtask';
    if (isSubtask) { subtasks.push(issue); continue; }

    // Resolve people. A REAL match is tracked for project membership; an
    // unmatched person becomes a truthful (unlinked) ghost — which is NOT added
    // as a member and consumes no seat. Assignee stays null only when the JIRA
    // ticket had no assignee at all.
    const assigneeReal = matcher.resolve(issue.fields.assignee?.emailAddress, issue.fields.assignee?.displayName);
    const reporterReal = matcher.resolve(issue.fields.reporter?.emailAddress, issue.fields.reporter?.displayName);
    const assigneeId = assigneeReal ?? (await ghostFor(issue.fields.assignee));
    const reporterId = reporterReal ?? (await ghostFor(issue.fields.reporter)) ?? actorId;
    if (assigneeReal) matchedUserIds.add(assigneeReal);
    if (reporterReal) matchedUserIds.add(reporterReal);

    // Resolve epic. Company-managed (classic) Jira stores the epic on the
    // "Epic Link" custom field (customfield_10014, an epic KEY); team-managed
    // (next-gen) projects store it as the issue `parent` (an Epic). epicMap holds
    // only epics, so a non-epic parent resolves to null safely.
    const epicKey =
      (issue.fields.customfield_10014 as string | null | undefined) ??
      issue.fields.parent?.key ??
      null;
    const epicId = epicKey ? (epicMap.get(epicKey) ?? null) : null;

    // Resolve status → core enum + the workflow column the card lands in.
    const resolved = workflow.resolve(issue.fields.status.name, issue.fields.status.statusCategory.key);
    let status: StoryStatus = resolved.status;
    let statusId: string | null = resolved.statusId;

    // Resolve sprint — JIRA returns the full sprint history of the issue.
    // For done issues, route to the closed sprint where it was completed;
    // for in-flight issues, prefer the active sprint.
    let sprintId: string | null = null;
    if (sprintMap.size > 0) {
      const sprintArr =
        (issue.fields.customfield_10020 as JiraSprintRef[] | null | undefined) ??
        (issue.fields.customfield_10010 as JiraSprintRef[] | null | undefined) ??
        null;
      const picked = pickRelevantSprint(sprintArr, status === 'done');
      if (picked?.id != null) sprintId = sprintMap.get(picked.id) ?? null;
    }

    const n = allocateNumber(issue.key);

    const story = await prisma.story.create({
      data: {
        projectId: targetProjectId,
        key: `${project.key}-${n}`,
        title: issue.fields.summary,
        description: adfToMarkdown(issue.fields.description),
        type: mapIssueType(typeName),
        priority: mapPriority(issue.fields.priority?.name),
        status,
        statusId,
        storyPoints: extractStoryPoints(issue.fields),
        epicId,
        sprintId,
        assigneeId,
        reporterId,
      },
    });

    storyMap.set(issue.key, { id: story.id, sprintId, epicId });
    imported++;
  }

  // Second pass — sub-tasks. We NEVER drop a sub-task: if its parent can't be
  // resolved (data quirk, parent missing) we import it as a top-level story
  // instead of skipping, so the import is lossless. Resolvable sub-tasks inherit
  // the parent's sprint + epic so they stay counted as sprint work like in JIRA.
  reporter.startPhase('subtasks', subtasks.length, 'Linking subtasks…');
  let subtaskIndex = 0;
  for (const issue of subtasks) {
    subtaskIndex++;
    reporter.tick(subtaskIndex);
    const parentJiraKey = issue.fields.parent?.key;
    const parent = parentJiraKey ? storyMap.get(parentJiraKey) ?? null : null;
    if (!parent) {
      // Parent unresolved — import standalone rather than lose the work item.
      logger.warn(
        `JIRA import: sub-task ${issue.key} parent ${parentJiraKey ?? '(none)'} not found — importing as top-level`,
      );
      subtasksReparented++;
    }

    const assigneeReal = matcher.resolve(issue.fields.assignee?.emailAddress, issue.fields.assignee?.displayName);
    const reporterReal = matcher.resolve(issue.fields.reporter?.emailAddress, issue.fields.reporter?.displayName);
    const assigneeId = assigneeReal ?? (await ghostFor(issue.fields.assignee));
    const reporterId = reporterReal ?? (await ghostFor(issue.fields.reporter)) ?? actorId;
    if (assigneeReal) matchedUserIds.add(assigneeReal);
    if (reporterReal) matchedUserIds.add(reporterReal);

    const n = allocateNumber(issue.key);

    const resolved = workflow.resolve(issue.fields.status.name, issue.fields.status.statusCategory.key);
    // Inherit the parent's sprint; bump backlog→todo when sprinted so the card
    // isn't stranded off the board (mirrors the top-level rule).
    const inheritedSprintId = parent?.sprintId ?? null;
    const subStatus = resolved.status;
    const subStatusId = resolved.statusId;

    const subtask = await prisma.story.create({
      data: {
        projectId: targetProjectId,
        key: `${project.key}-${n}`,
        title: issue.fields.summary,
        description: adfToMarkdown(issue.fields.description),
        type: 'task',
        priority: mapPriority(issue.fields.priority?.name),
        status: subStatus,
        statusId: subStatusId,
        storyPoints: extractStoryPoints(issue.fields),
        epicId: parent?.epicId ?? null,
        sprintId: inheritedSprintId,
        reporterId,
        assigneeId,
        parentStoryId: parent?.id ?? null,
      },
    });

    storyMap.set(issue.key, { id: subtask.id, sprintId: inheritedSprintId, epicId: parent?.epicId ?? null });
    imported++;
  }

  // Advance the project's story counter past every number we used, so future
  // manually-created stories never collide with a preserved JIRA number. Reduce
  // (not Math.max(...spread)) so a project with tens of thousands of issues can't
  // overflow the call stack.
  let maxUsed = 0;
  for (const num of usedNumbers) if (num > maxUsed) maxUsed = num;
  await prisma.project.update({
    where: { id: targetProjectId },
    data: { nextStoryNumber: maxUsed + 1 },
  });

  // Third pass — attachments (issue files + inline-image media) AND comments.
  // The heaviest phase: one download + storage write per file. Runs after every
  // story exists so each file/comment links to its story; the per-issue media
  // map is reused to rewrite inline images in BOTH the description and comments.
  const totalAttachments = issues.reduce(
    (sum, issue) => (storyMap.has(issue.key) ? sum + (issue.fields.attachment?.length ?? 0) : sum),
    0,
  );
  reporter.startPhase('attachments', totalAttachments, 'Importing attachments & comments…');
  let attachmentsDone = 0;
  let attachmentsImported = 0;
  let commentsImported = 0;
  for (const issue of issues) {
    const meta = storyMap.get(issue.key);
    if (!meta) continue;
    const hasAttachments = !!issue.fields.attachment?.length;
    const hasComments =
      !!issue.fields.comment?.comments?.length || (issue.fields.comment?.total ?? 0) > 0;
    if (!hasAttachments && !hasComments) continue;

    const idMap = hasAttachments
      ? await importAttachments(
          creds, issue, targetProjectId, meta.id, matcher, ghostFor, actorId, attachmentFailures,
          () => { attachmentsDone++; reporter.tick(attachmentsDone); },
        )
      : new Map<string, string>();
    attachmentsImported += idMap.size;

    if (idMap.size > 0) {
      const rewritten = rewriteInlineImages(issue.fields.description, idMap);
      if (rewritten) {
        await prisma.story.update({ where: { id: meta.id }, data: { description: rewritten } });
      }
    }

    if (hasComments) {
      commentsImported += await importComments(creds, issue, meta.id, matcher, ghostFor, actorId, idMap);
    }
  }

  return {
    imported,
    skipped,
    subtasksReparented,
    matchedUserIds: [...matchedUserIds],
    attachmentsImported,
    commentsImported,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const jiraImportService = {
  preview: previewImport,

  async importTickets(opts: ImportTicketsOptions) {
    const reporter = makeReporter(opts.onProgress, TICKETS_PLAN);

    // Route imported tickets onto the existing project's own workflow columns —
    // we never overwrite a project the user already set up.
    reporter.startPhase('setup', 1, 'Loading project workflow…');
    const workflow = await existingProjectWorkflow(opts.targetProjectId);
    // Built once and shared across epics + issues + attachments so user matching
    // (assignee/reporter/attachment author) is consistent and DB-cheap. ghostFor
    // find-or-creates (unlinked) tags for unmatched people, deduped per import.
    const matcher = await buildUserMatcher();
    const ghostFor = makeGhostResolver();
    const attachmentFailures: AttachmentFailure[] = [];
    reporter.tick(1);

    const epicMap = await importEpics(
      opts.creds, opts.jiraProjectKey, opts.targetProjectId, opts.actorId, matcher, ghostFor, attachmentFailures, reporter,
    );
    const { matchedUserIds, ...result } = await importIssues(
      opts.creds, opts.jiraProjectKey, opts.targetProjectId, epicMap, new Map(), opts.actorId, workflow,
      matcher, ghostFor, attachmentFailures, reporter,
    );

    reporter.startPhase('members', 1, 'Linking team members…');
    const membersLinked = await ensureProjectMembers(opts.targetProjectId, matchedUserIds, opts.actorId);
    reporter.tick(1);

    reporter.done();
    return { ...result, membersLinked, attachmentFailures };
  },

  async importFullProject(opts: ImportFullProjectOptions) {
    const reporter = makeReporter(opts.onProgress, PROJECT_PLAN);

    // 1. Keep the original JIRA project key (e.g. "KW", "KWDC") when it's free.
    //    Only if it collides with an existing RitJira project do we mint a new
    //    one — suffixed off the JIRA key first ("KW" → "KW2"), falling back to a
    //    name-derived key if the JIRA key is somehow empty.
    reporter.startPhase('setup', 1, 'Creating project…');
    const base = opts.jiraProjectKey?.trim() || deriveKey(opts.jiraProjectName);
    const key = await uniqueProjectKey(base);

    // 2. Create project + add the importer as lead. We DON'T seed the default
    //    workflow yet — we first try to mirror the JIRA board's columns.
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          key,
          name: opts.jiraProjectName,
          createdById: opts.actorId,
          organizationId: opts.organizationId,
        },
      });
      await tx.projectMember.create({
        data: { projectId: p.id, userId: opts.actorId, projectRole: 'lead' },
      });
      return p;
    });
    reporter.tick(1);

    // 3. Workflow — recreate the JIRA board's columns. If the project has no
    //    board (or it can't be read), fall back to the default workflow.
    reporter.startPhase('workflow', 1, 'Recreating workflow board…');
    let workflow = await importWorkflow(opts.creds, opts.jiraProjectKey, project.id);
    if (!workflow) {
      await workflowService.seedDefaults(project.id);
      workflow = await existingProjectWorkflow(project.id);
    }
    reporter.tick(1);

    // Shared across epics + issues + attachments (see importTickets).
    const matcher = await buildUserMatcher();
    const ghostFor = makeGhostResolver();
    const attachmentFailures: AttachmentFailure[] = [];

    // 4. Epics, sprints, issues
    const epicMap = await importEpics(
      opts.creds, opts.jiraProjectKey, project.id, opts.actorId, matcher, ghostFor, attachmentFailures, reporter,
    );
    const sprintMap = await importSprints(opts.creds, opts.jiraProjectKey, project.id, opts.actorId, reporter);
    const { matchedUserIds, ...result } = await importIssues(
      opts.creds, opts.jiraProjectKey, project.id, epicMap, sprintMap, opts.actorId, workflow,
      matcher, ghostFor, attachmentFailures, reporter,
    );

    // 5. Add every email-matched JIRA user as a project member (developer).
    reporter.startPhase('members', 1, 'Linking team members…');
    const membersLinked = await ensureProjectMembers(project.id, matchedUserIds, opts.actorId);
    reporter.tick(1);

    reporter.done();
    return {
      projectId: project.id,
      projectKey: key,
      epicCount: epicMap.size,
      sprintCount: sprintMap.size,
      workflowColumns: workflow.columnNames,
      membersLinked,
      attachmentFailures,
      ...result,
    };
  },
};
