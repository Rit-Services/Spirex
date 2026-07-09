// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';

export type SearchType = 'story' | 'epic' | 'project' | 'comment';
export type StoryStatusFilter =
  | 'todo' | 'in_progress' | 'in_review' | 'qa' | 'done';
export type StoryTypeFilter = 'story' | 'bug' | 'task';

export interface SearchHit {
  type: SearchType;
  id: string;
  key?: string;
  title: string;
  snippet: string;
  rank: number;
  projectId: string;
  projectKey: string;
  /**
   * Which field the query actually hit — 'title' | 'description' | 'comment' |
   * 'acceptance criteria' | 'custom field'. Drives the "matched in …" badge so
   * the user sees WHY a result ranked where it did. Undefined for browse mode or
   * a stemmed-only FTS hit with no literal substring in any single field.
   */
  matchedIn?: string;
  // story extras
  status?: string;
  priority?: string;
  // comment extras — link back to parent story
  storyId?: string;
  storyKey?: string;
}

export interface SearchParams {
  q: string;
  type?: SearchType;
  projectId?: string;
  status?: StoryStatusFilter;
  storyType?: StoryTypeFilter;
  /** User id, or the literal string 'unassigned' to filter for unassigned stories. */
  assigneeId?: string;
  reporterId?: string;
  actorUserId: string;
  /** The caller's active org — search is scoped to it (Phase 2). */
  organizationId?: string;
  actorGlobalRole: 'admin' | 'member';
}

interface StoryFilters {
  status?: StoryStatusFilter;
  storyType?: StoryTypeFilter;
  assigneeId?: string;
  reporterId?: string;
}

function hasStoryFilter(f: StoryFilters): boolean {
  return !!(f.status || f.storyType || f.assigneeId || f.reporterId);
}

function storyWhereClauses(f: StoryFilters, alias = 's'): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  if (f.status) {
    out.push(Prisma.sql`${Prisma.raw(alias)}.status = ${f.status}::"StoryStatus"`);
  }
  if (f.storyType) {
    out.push(Prisma.sql`${Prisma.raw(alias)}.type = ${f.storyType}::"StoryType"`);
  }
  if (f.assigneeId === 'unassigned') {
    out.push(Prisma.sql`${Prisma.raw(alias)}."assigneeId" IS NULL`);
  } else if (f.assigneeId) {
    out.push(Prisma.sql`${Prisma.raw(alias)}."assigneeId" = ${f.assigneeId}`);
  }
  if (f.reporterId) {
    out.push(Prisma.sql`${Prisma.raw(alias)}."reporterId" = ${f.reporterId}`);
  }
  return out;
}

export interface SearchResponse {
  stories: SearchHit[];
  epics: SearchHit[];
  projects: SearchHit[];
  comments: SearchHit[];
  total: number;
}

async function allowedProjectIds(
  actorUserId: string,
  actorGlobalRole: 'admin' | 'member',
  organizationId: string | undefined,
  filterProjectId?: string,
): Promise<string[]> {
  // Phase 2: search is always scoped to the ACTIVE org. No org context → no
  // results (a user with no resolved org can't search any tenant's data).
  if (!organizationId) return [];
  if (actorGlobalRole === 'admin') {
    if (filterProjectId) return [filterProjectId];
    const all = await prisma.project.findMany({
      where: { organizationId },
      select: { id: true },
    });
    return all.map((p) => p.id);
  }
  // A member sees only projects they belong to WITHIN this org — never a
  // project they're a member of in some other org.
  const memberships = await prisma.projectMember.findMany({
    where: { userId: actorUserId, project: { organizationId } },
    select: { projectId: true },
  });
  let ids = memberships.map((m) => m.projectId);
  if (filterProjectId) ids = ids.filter((id) => id === filterProjectId);
  return ids;
}

interface StoryRow {
  id: string; key: string; title: string; description: string | null;
  acceptanceCriteria: string | null; commentText: string | null;
  rank: number; projectId: string; projectKey: string; status: string; priority: string;
}
interface EpicRow {
  id: string; key: string; title: string; description: string | null;
  rank: number; projectId: string; projectKey: string;
}
interface ProjectRow {
  id: string; key: string; name: string; description: string | null;
  rank: number;
}
interface CommentRow {
  id: string; body: string; rank: number;
  storyId: string; storyKey: string; projectId: string; projectKey: string;
}

/**
 * Stories/Epics/Comments may have their description/body stored as a TipTap
 * JSON document (post Phase 8). Postgres FTS happily indexes the JSON text
 * itself ("doc", "paragraph", "text" tokens) which both pollutes match
 * results and surfaces raw JSON in snippets/titles. Convert to plain text
 * server-side before building the snippet & preview.
 */
function tiptapPlainText(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return trimmed;
  try {
    const obj = JSON.parse(trimmed);
    if (!obj || typeof obj !== 'object' || obj.type !== 'doc') return trimmed;
    const parts: string[] = [];
    const walk = (nodes: unknown): void => {
      if (!Array.isArray(nodes)) return;
      for (const raw of nodes) {
        const n = raw as { type?: string; text?: string; attrs?: { label?: string }; content?: unknown };
        if (!n) continue;
        if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text);
        else if (n.type === 'mention' && n.attrs?.label) parts.push(`@${n.attrs.label}`);
        if (n.content) walk(n.content);
      }
    };
    walk((obj as { content?: unknown }).content);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return trimmed;
  }
}

const SNIPPET_MAX = 200;
const SNIPPET_PRE = 40;
const SNIPPET_POST = 120;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;',
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSnippet(plain: string, q: string): string {
  if (!plain) return '';
  if (!q) {
    return plain.length > SNIPPET_MAX ? `${escapeHtml(plain.slice(0, SNIPPET_MAX))}…` : escapeHtml(plain);
  }
  const lower = plain.toLowerCase();
  const ql = q.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx === -1) {
    return plain.length > SNIPPET_MAX ? `${escapeHtml(plain.slice(0, SNIPPET_MAX))}…` : escapeHtml(plain);
  }
  const start = Math.max(0, idx - SNIPPET_PRE);
  const end = Math.min(plain.length, idx + ql.length + SNIPPET_POST);
  const slice = plain.slice(start, end);
  const re = new RegExp(escapeRegex(q), 'ig');
  const html = escapeHtml(slice).replace(re, (m) => `<b>${escapeHtml(m)}</b>`);
  return `${start > 0 ? '…' : ''}${html}${end < plain.length ? '…' : ''}`;
}

/**
 * SQL fragment yielding the plain-text FTS source for a column. Values that look
 * like a serialized TipTap JSON doc (post Phase 8) are NOT indexed raw — that
 * would flood FTS with literal JSON tokens ("type", "doc", "paragraph"). Instead
 * we pull the readable text out of the doc with a jsonpath, so real content
 * (description / comment / acceptance-criteria bodies) is actually searchable.
 *
 * `strict $.**?(@.type == "text").text` walks every node at any depth, keeps the
 * `text` nodes, and returns their strings — the `?(@.type == "text")` filter is
 * what stops the recursive `$.**` wildcard from emitting each value twice. The
 * `LIKE` guard short-circuits plain-text rows so they never pay the jsonb cast.
 */
function plainText(colExpr: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE
    WHEN ${colExpr} LIKE '{"type":"doc"%' THEN coalesce((
      SELECT string_agg(t.value, ' ')
      FROM jsonb_array_elements_text(
        jsonb_path_query_array(${colExpr}::jsonb, 'strict $.**?(@.type == "text").text')
      ) AS t(value)
    ), '')
    ELSE coalesce(${colExpr}, '')
  END`;
}

/**
 * Build the match WHERE fragment + rank expression for a text source.
 *
 * Plain Postgres FTS (`to_tsvector @@ plainto_tsquery`) only matches whole,
 * stemmed lexemes — so a partial/prefix query ("Acm" → "Acme"), or a name that
 * stems to nothing / is all stopwords, silently matches NOTHING. We OR in a
 * case-insensitive SUBSTRING check (`strpos`, no LIKE-wildcard escaping needed)
 * so "search as you type" and partial names work. FTS hits still rank highest;
 * substring-only hits get a small constant so they order sensibly beneath them.
 * With an empty query both are no-ops (browse mode is unchanged).
 *
 * `substrSource` defaults to the FTS source but can be narrowed to the cheap
 * columns — e.g. story search's FTS source pulls in a correlated custom-field
 * subquery we don't want the substring check to re-run.
 */
function textMatch(
  ftsSource: Prisma.Sql,
  q: string,
  substrSource: Prisma.Sql = ftsSource,
): { where: Prisma.Sql; rank: Prisma.Sql } {
  if (!q) return { where: Prisma.empty, rank: Prisma.sql`0` };
  const tsv = Prisma.sql`to_tsvector('english', ${ftsSource})`;
  const tsq = Prisma.sql`plainto_tsquery('english', ${q})`;
  const substr = Prisma.sql`strpos(lower(${substrSource}), lower(${q})) > 0`;
  return {
    where: Prisma.sql` AND (${tsv} @@ ${tsq} OR ${substr})`,
    rank: Prisma.sql`ts_rank_cd(${tsv}, ${tsq}) + (CASE WHEN ${substr} THEN 0.1 ELSE 0 END)`,
  };
}

/**
 * One field of a WEIGHTED match. `weight` is the Postgres FTS class (A>B>C>D);
 * `bonus` is the graded constant added when the query appears as a literal
 * substring of this field — omit it to make the field FTS-only (e.g. custom
 * fields, which we don't want partial substring search to comb through).
 */
interface WeightedField {
  src: Prisma.Sql;
  weight: 'A' | 'B' | 'C' | 'D';
  bonus?: number;
}

/**
 * Field-aware ranking. Instead of flattening every column into ONE tsvector
 * (which makes a title hit rank identically to a description hit), each field is
 * `setweight`-tagged A/B/C/D and concatenated. `ts_rank_cd` then ranks A>B>C>D
 * out of the box — so title beats description beats comments beats acceptance
 * criteria. The graded substring bonus mirrors that ordering for partial /
 * as-you-type queries that plain FTS can't match. Empty query → no-op (browse).
 */
function weightedMatch(
  fields: WeightedField[],
  q: string,
): { where: Prisma.Sql; rank: Prisma.Sql } {
  if (!q) return { where: Prisma.empty, rank: Prisma.sql`0` };
  const tsv = Prisma.sql`(${Prisma.join(
    fields.map(
      (f) =>
        Prisma.sql`setweight(to_tsvector('english', ${f.src}), ${Prisma.raw(`'${f.weight}'`)})`,
    ),
    ' || ',
  )})`;
  const tsq = Prisma.sql`plainto_tsquery('english', ${q})`;

  const substrFields = fields.filter((f) => f.bonus != null);
  const anySubstr = substrFields.length
    ? Prisma.join(
        substrFields.map((f) => Prisma.sql`strpos(lower(${f.src}), lower(${q})) > 0`),
        ' OR ',
      )
    : Prisma.sql`false`;
  // Highest-priority field that literally contains the query wins its bonus —
  // a CASE cascade, so a title substring outranks a description substring even
  // when both are present.
  const substrBonus = substrFields.length
    ? Prisma.sql`CASE ${Prisma.join(
        substrFields.map(
          (f) => Prisma.sql`WHEN strpos(lower(${f.src}), lower(${q})) > 0 THEN ${f.bonus}`,
        ),
        ' ',
      )} ELSE 0 END`
    : Prisma.sql`0`;

  return {
    where: Prisma.sql` AND (${tsv} @@ ${tsq} OR (${anySubstr}))`,
    rank: Prisma.sql`ts_rank_cd(${tsv}, ${tsq}) + (${substrBonus})`,
  };
}

/**
 * Given the query and the entity's fields IN PRIORITY ORDER, resolve which field
 * the user actually hit (for the "matched in …" badge) and build the snippet
 * from that field — so a match in acceptance criteria shows the AC excerpt, not
 * an empty/irrelevant description. A title hit intentionally shows the NEXT
 * field's text as the snippet, because the title is already the card heading —
 * repeating it adds nothing.
 */
function resolveMatch(
  q: string,
  fields: { label: string; text: string }[],
): { matchedIn?: string; snippet: string } {
  const ql = q.trim().toLowerCase();
  const firstNonEmpty = fields.find((f) => f.text)?.text ?? '';
  if (!ql) return { snippet: buildSnippet(firstNonEmpty, q) };

  const idx = fields.findIndex((f) => f.text && f.text.toLowerCase().includes(ql));
  if (idx === -1) {
    // Stemmed-only FTS hit (e.g. "running" ~ "run") — no literal substring in
    // any single field. Leave the badge off; snippet from the first content field.
    return { snippet: buildSnippet(firstNonEmpty, q) };
  }
  const hit = fields[idx];
  // Title hit → snippet from the next field with content (context, not a repeat).
  const snippetText =
    idx === 0 ? fields.slice(1).find((f) => f.text)?.text ?? hit.text : hit.text;
  return { matchedIn: hit.label, snippet: buildSnippet(snippetText, q) };
}

async function searchStories(
  q: string,
  projectIds: string[],
  filters: StoryFilters,
): Promise<SearchHit[]> {
  if (!projectIds.length) return [];
  const extra = storyWhereClauses(filters, 's');
  const extraSql = extra.length ? Prisma.sql` AND ${Prisma.join(extra, ' AND ')}` : Prisma.empty;
  const useFts = q.length > 0;

  // Field sources, in the priority the user wants:
  //   title (A) > description (B) > comments (C) > acceptance criteria (D).
  // Comments + custom-field text come from LATERAL joins (cmt.txt / cf.txt) so
  // each correlated aggregate is computed ONCE per row, not once per reference.
  const titleSrc = Prisma.sql`(coalesce(s.key,'') || ' ' || s.title)`;
  const descSrc = plainText(Prisma.sql`s.description`);
  const acSrc = plainText(Prisma.sql`s."acceptanceCriteria"`);
  const cmtSrc = Prisma.sql`coalesce(cmt.txt, '')`;
  // Custom field STRING values (text/select/date types) join the FTS source so
  // "ACME" finds tickets whose Customer field says ACME. Weighted lowest (D) and
  // FTS-only — no substring bonus — so they never outrank a real title/desc hit.
  const cfSrc = Prisma.sql`coalesce(cf.txt, '')`;

  const { where: matchWhere, rank: rankExpr } = weightedMatch(
    [
      { src: titleSrc, weight: 'A', bonus: 1.0 },
      { src: descSrc, weight: 'B', bonus: 0.5 },
      { src: cmtSrc, weight: 'C', bonus: 0.25 },
      { src: acSrc, weight: 'D', bonus: 0.12 },
      { src: cfSrc, weight: 'D' },
    ],
    q,
  );
  // Tiebreak equal-rank hits by recency so the ordering is stable & sensible.
  const orderBy = useFts ? Prisma.sql`rank DESC, s."updatedAt" DESC` : Prisma.sql`s."updatedAt" DESC`;
  const rows = await prisma.$queryRaw<StoryRow[]>(
    Prisma.sql`
      SELECT
        s.id, s.key, s.title, s.description, s."acceptanceCriteria", s."projectId",
        cmt.txt AS "commentText",
        ${rankExpr} AS rank,
        s.status, s.priority,
        p.key AS "projectKey"
      FROM "Story" s
      JOIN "Project" p ON p.id = s."projectId"
      LEFT JOIN LATERAL (
        SELECT string_agg(${plainText(Prisma.sql`c.body`)}, ' ') AS txt
        FROM "Comment" c WHERE c."storyId" = s.id
      ) cmt ON true
      LEFT JOIN LATERAL (
        SELECT string_agg(cfv.value #>> '{}', ' ') AS txt
        FROM "CustomFieldValue" cfv
        WHERE cfv."storyId" = s.id AND jsonb_typeof(cfv.value) = 'string'
      ) cf ON true
      WHERE s."projectId" = ANY(ARRAY[${Prisma.join(projectIds)}])${matchWhere}${extraSql}
      ORDER BY ${orderBy}
      LIMIT 50
    `,
  );
  return rows.map((r) => {
    const { matchedIn, snippet } = resolveMatch(q, [
      { label: 'title', text: `${r.key ?? ''} ${r.title}`.trim() },
      { label: 'description', text: tiptapPlainText(r.description) },
      { label: 'comment', text: (r.commentText ?? '').replace(/\s+/g, ' ').trim() },
      { label: 'acceptance criteria', text: tiptapPlainText(r.acceptanceCriteria) },
    ]);
    return {
      type: 'story' as const,
      id: r.id, key: r.key, title: r.title,
      snippet, matchedIn,
      rank: Number(r.rank),
      projectId: r.projectId, projectKey: r.projectKey,
      status: r.status, priority: r.priority,
    };
  });
}

async function searchEpics(q: string, projectIds: string[]): Promise<SearchHit[]> {
  if (!projectIds.length) return [];
  const useFts = q.length > 0;
  const descSrc = plainText(Prisma.sql`e.description`);
  const { where: matchWhere, rank: rankExpr } = weightedMatch(
    [
      { src: Prisma.sql`(coalesce(e.key,'') || ' ' || e.title)`, weight: 'A', bonus: 1.0 },
      { src: descSrc, weight: 'B', bonus: 0.5 },
    ],
    q,
  );
  const orderBy = useFts ? Prisma.sql`rank DESC, e."updatedAt" DESC` : Prisma.sql`e."updatedAt" DESC`;
  const rows = await prisma.$queryRaw<EpicRow[]>(
    Prisma.sql`
      SELECT
        e.id, e.key, e.title, e.description, e."projectId",
        ${rankExpr} AS rank,
        p.key AS "projectKey"
      FROM "Epic" e
      JOIN "Project" p ON p.id = e."projectId"
      WHERE e."projectId" = ANY(ARRAY[${Prisma.join(projectIds)}])${matchWhere}
      ORDER BY ${orderBy}
      LIMIT 20
    `,
  );
  return rows.map((r) => {
    const { matchedIn, snippet } = resolveMatch(q, [
      { label: 'title', text: `${r.key ?? ''} ${r.title}`.trim() },
      { label: 'description', text: tiptapPlainText(r.description) },
    ]);
    return {
      type: 'epic' as const,
      id: r.id, key: r.key, title: r.title,
      snippet, matchedIn,
      rank: Number(r.rank),
      projectId: r.projectId, projectKey: r.projectKey,
    };
  });
}

async function searchProjects(q: string, projectIds: string[]): Promise<SearchHit[]> {
  if (!projectIds.length) return [];
  const useFts = q.length > 0;
  const descSrc = plainText(Prisma.sql`p.description`);
  const { where: matchWhere, rank: rankExpr } = weightedMatch(
    [
      { src: Prisma.sql`(coalesce(p.key,'') || ' ' || p.name)`, weight: 'A', bonus: 1.0 },
      { src: descSrc, weight: 'B', bonus: 0.5 },
    ],
    q,
  );
  const orderBy = useFts ? Prisma.sql`rank DESC, p.name ASC` : Prisma.sql`p.name ASC`;
  const rows = await prisma.$queryRaw<ProjectRow[]>(
    Prisma.sql`
      SELECT
        p.id, p.key, p.name, p.description,
        ${rankExpr} AS rank
      FROM "Project" p
      WHERE p.id = ANY(ARRAY[${Prisma.join(projectIds)}])${matchWhere}
      ORDER BY ${orderBy}
      LIMIT 20
    `,
  );
  return rows.map((r) => {
    const { matchedIn, snippet } = resolveMatch(q, [
      { label: 'name', text: `${r.key ?? ''} ${r.name}`.trim() },
      { label: 'description', text: tiptapPlainText(r.description) },
    ]);
    return {
      type: 'project' as const,
      id: r.id, key: r.key, title: r.name,
      snippet, matchedIn,
      rank: Number(r.rank),
      projectId: r.id, projectKey: r.key,
    };
  });
}

async function searchComments(
  q: string,
  projectIds: string[],
  filters: StoryFilters,
): Promise<SearchHit[]> {
  if (!projectIds.length) return [];
  const extra = storyWhereClauses(filters, 's');
  const extraSql = extra.length ? Prisma.sql` AND ${Prisma.join(extra, ' AND ')}` : Prisma.empty;
  const useFts = q.length > 0;
  const bodySrc = plainText(Prisma.sql`c.body`);
  const { where: ftsWhere, rank: rankExpr } = textMatch(bodySrc, q);
  const orderBy = useFts ? Prisma.sql`rank DESC` : Prisma.sql`c."createdAt" DESC`;
  const rows = await prisma.$queryRaw<CommentRow[]>(
    Prisma.sql`
      SELECT
        c.id, c.body, c."storyId",
        ${rankExpr} AS rank,
        s.key AS "storyKey", s."projectId",
        p.key AS "projectKey"
      FROM "Comment" c
      JOIN "Story" s ON s.id = c."storyId"
      JOIN "Project" p ON p.id = s."projectId"
      WHERE s."projectId" = ANY(ARRAY[${Prisma.join(projectIds)}])${ftsWhere}${extraSql}
      ORDER BY ${orderBy}
      LIMIT 30
    `,
  );
  return rows.map((r) => {
    const plain = tiptapPlainText(r.body);
    const titlePreview = plain.length > 80 ? `${plain.slice(0, 80)}…` : plain || '(empty comment)';
    return {
      type: 'comment' as const,
      id: r.id,
      title: titlePreview,
      snippet: buildSnippet(plain, q),
      rank: Number(r.rank),
      storyId: r.storyId, storyKey: r.storyKey,
      projectId: r.projectId, projectKey: r.projectKey,
    };
  });
}

export const searchService = {
  async search(params: SearchParams): Promise<SearchResponse> {
    const {
      q, type, projectId, status, storyType, assigneeId, reporterId,
      actorUserId, actorGlobalRole, organizationId,
    } = params;

    const projectIds = await allowedProjectIds(actorUserId, actorGlobalRole, organizationId, projectId);
    const filters: StoryFilters = { status, storyType, assigneeId, reporterId };
    // Story-attribute filters don't apply to epics/projects, so suppress those
    // sections when any such filter is active to avoid noisy unrelated hits.
    const storyFilterActive = hasStoryFilter(filters);

    const [stories, epics, projects, comments] = await Promise.all([
      !type || type === 'story'   ? searchStories(q, projectIds, filters)  : Promise.resolve([]),
      (!type || type === 'epic') && !storyFilterActive
        ? searchEpics(q, projectIds)    : Promise.resolve([]),
      (!type || type === 'project') && !storyFilterActive
        ? searchProjects(q, projectIds) : Promise.resolve([]),
      !type || type === 'comment' ? searchComments(q, projectIds, filters) : Promise.resolve([]),
    ]);

    return {
      stories, epics, projects, comments,
      total: stories.length + epics.length + projects.length + comments.length,
    };
  },
};
