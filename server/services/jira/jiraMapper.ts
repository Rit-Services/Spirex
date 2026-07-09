// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { StoryType, Priority, StoryStatus, SprintStatus, EpicStatus, StatusCategory } from '@prisma/client';
import type { JiraIssue, JiraSprint } from './jiraClient.js';

// ── Issue type ───────────────────────────────────────────────────────────────

export function mapIssueType(jiraType: string): StoryType {
  const t = jiraType.toLowerCase();
  if (t === 'bug') return 'bug';
  if (t === 'task' || t === 'sub-task' || t === 'subtask') return 'task';
  return 'story';
}

// ── Priority ─────────────────────────────────────────────────────────────────

export function mapPriority(jiraPriority: string | null | undefined): Priority {
  const p = (jiraPriority ?? '').toLowerCase();
  if (p === 'critical' || p === 'blocker') return 'critical';
  if (p === 'high' || p === 'major') return 'high';
  if (p === 'low' || p === 'minor' || p === 'trivial') return 'low';
  return 'medium';
}

// ── Story status ─────────────────────────────────────────────────────────────

export function mapStoryStatus(jiraStatusCategory: string, jiraStatusName: string): StoryStatus {
  const cat = jiraStatusCategory.toLowerCase();
  const name = jiraStatusName.toLowerCase();

  if (cat === 'done' || name === 'done' || name === 'closed' || name === 'resolved') return 'done';
  if (name.includes('review') || name.includes('testing') || name.includes('qa')) return 'in_review';
  if (name.includes('progress') || name.includes('dev') || name.includes('in dev')) return 'in_progress';
  if (name === 'selected for development' || name === 'ready' || name.includes('to do')) return 'todo';
  return 'todo';
}

// ── Workflow column mapping ───────────────────────────────────────────────────

/**
 * Map a JIRA status category key to SPIREX's three-bucket StatusCategory.
 * JIRA uses: `new` (To Do), `indeterminate` (In Progress), `done`.
 */
export function mapJiraStatusCategory(key: string | null | undefined): StatusCategory {
  const k = (key ?? '').toLowerCase();
  if (k === 'done') return 'done';
  if (k === 'indeterminate' || k === 'in progress' || k === 'in_progress') return 'in_progress';
  return 'todo';
}

/**
 * Pick the core StoryStatus a JIRA board column should pin to. The category key
 * decides the bucket; for in-progress columns we refine by the column name so a
 * "Code Review" or "QA" column lands on the matching core enum instead of a flat
 * `in_progress`. (A column literally named "Backlog" just maps to To Do — there
 * is no `backlog` status; backlog membership is whether a story has a sprint.)
 */
export function mapColumnToCoreStatus(
  columnName: string,
  categoryKey: string | null | undefined,
): StoryStatus {
  const name = columnName.trim().toLowerCase();
  const category = mapJiraStatusCategory(categoryKey);
  if (category === 'done') return 'done';
  if (category === 'todo') return 'todo';
  if (name.includes('review')) return 'in_review';
  if (name.includes('qa') || name.includes('test')) return 'qa';
  return 'in_progress';
}

/** The StatusCategory a core enum value belongs to (board grouping + theming). */
export function categoryForCoreStatus(core: StoryStatus): StatusCategory {
  if (core === 'done') return 'done';
  if (core === 'todo') return 'todo';
  return 'in_progress';
}

/** Default column colours, keyed by the core status the column pins to. */
export const WORKFLOW_COLOR_BY_CORE: Record<StoryStatus, string> = {
  todo: '#64748B',
  in_progress: '#3B82F6',
  in_review: '#8B5CF6',
  qa: '#F59E0B',
  done: '#10B981',
};

// ── Sprint status ─────────────────────────────────────────────────────────────

export function mapSprintStatus(jiraState: string): SprintStatus {
  if (jiraState === 'active') return 'active';
  if (jiraState === 'closed') return 'completed';
  return 'planned';
}

// ── Epic status ───────────────────────────────────────────────────────────────

export function mapEpicStatus(statusCategory: string): EpicStatus {
  const s = statusCategory.toLowerCase();
  if (s === 'done') return 'done';
  if (s === 'indeterminate' || s === 'in progress') return 'in_progress';
  return 'open';
}

// ── Story points ──────────────────────────────────────────────────────────────

export function extractStoryPoints(fields: JiraIssue['fields']): number | null {
  const sp =
    fields.customfield_10016 ??
    fields.customfield_10028 ??
    fields.story_points ??
    null;
  if (sp == null) return null;
  const n = Number(sp);
  return isNaN(n) ? null : n;
}

// ── ADF → plain-text description ─────────────────────────────────────────────

interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

/**
 * Resolves an ADF media node to a markdown image URL. Given the media's `id`
 * (which equals the issue attachment id), returns the served URL of the stored
 * copy, or null if we couldn't import that attachment (the image is then
 * dropped rather than left pointing at an unreachable JIRA URL).
 */
export type MediaResolver = (mediaId: string) => string | null;

/** Render an ADF `media` node as a markdown image, or '' when unresolvable. */
function mediaToMarkdown(node: AdfNode, resolve?: MediaResolver): string {
  const attrs = node.attrs ?? {};
  const alt = (attrs.alt as string) || '';
  // Externally-hosted media carries its own URL — emit it directly.
  if (attrs.type === 'external' && typeof attrs.url === 'string') {
    return `![${alt}](${attrs.url})`;
  }
  // File media references an attachment by id — rewrite to the stored copy.
  const id = attrs.id as string | undefined;
  if (id && resolve) {
    const url = resolve(id);
    if (url) return `![${alt}](${url})`;
  }
  return '';
}

function adfNodeToText(node: AdfNode, resolve?: MediaResolver): string {
  if (node.type === 'text') return node.text ?? '';
  // Media nodes are leaves (no child content) — handle before the empty guard
  // so embedded images aren't silently swallowed.
  if (node.type === 'media' || node.type === 'mediaInline') {
    return mediaToMarkdown(node, resolve);
  }
  if (!node.content?.length) return '';

  const childText = node.content.map((c) => adfNodeToText(c, resolve)).join('');

  switch (node.type) {
    case 'paragraph': return childText + '\n\n';
    case 'heading': return '#'.repeat((node.attrs?.level as number) ?? 1) + ' ' + childText + '\n\n';
    case 'bulletList':
    case 'orderedList': return childText;
    case 'listItem': return '- ' + childText.trim() + '\n';
    case 'codeBlock': return '```\n' + childText + '\n```\n\n';
    case 'blockquote': return '> ' + childText.trim() + '\n\n';
    // mediaSingle / mediaGroup wrap one-or-more media leaves on their own line.
    case 'mediaSingle':
    case 'mediaGroup': return childText + '\n\n';
    case 'hardBreak': return '\n';
    case 'rule': return '---\n\n';
    default: return childText;
  }
}

/**
 * Convert a JIRA ADF description to markdown. Pass `resolve` to rewrite embedded
 * image (`media`) nodes to the URLs of their imported copies; omit it for a
 * text-only pass (media is then stripped, the original behaviour).
 */
export function adfToMarkdown(description: unknown, resolve?: MediaResolver): string | null {
  if (!description) return null;
  if (typeof description === 'string') return description.trim() || null;

  try {
    const doc = description as AdfNode;
    if (doc.type !== 'doc' || !doc.content?.length) return null;
    const text = doc.content.map((c) => adfNodeToText(c, resolve)).join('').trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Collect the attachment ids referenced by embedded `media` nodes in an ADF
 * description — i.e. which of an issue's attachments are inline images. Used to
 * decide whether a description needs a media-aware re-render after attachments
 * are imported.
 */
export function collectMediaIds(description: unknown): string[] {
  const ids: string[] = [];
  const walk = (node: AdfNode) => {
    if ((node.type === 'media' || node.type === 'mediaInline') && typeof node.attrs?.id === 'string') {
      ids.push(node.attrs.id as string);
    }
    node.content?.forEach(walk);
  };
  try {
    const doc = description as AdfNode;
    if (doc?.content?.length) doc.content.forEach(walk);
  } catch { /* ignore */ }
  return ids;
}

// ── Epic colour ────────────────────────────────────────────────────────────────

const JIRA_EPIC_COLORS: Record<string, string> = {
  'color_1': '#0052CC',
  'color_2': '#00875A',
  'color_3': '#FF8B00',
  'color_4': '#FF5630',
  'color_5': '#6554C0',
  'color_6': '#00B8D9',
  'color_7': '#36B37E',
  'color_8': '#FF7452',
};

export function mapEpicColor(colorKey: string | null | undefined): string {
  if (!colorKey) return '#0052CC';
  return JIRA_EPIC_COLORS[colorKey] ?? '#0052CC';
}

// ── Sprint date helpers ───────────────────────────────────────────────────────

export function parseJiraDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}
