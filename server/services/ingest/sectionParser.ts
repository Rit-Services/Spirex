// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { StoryType, Priority } from '@prisma/client';

export interface DraftStory {
  localId: string;
  title: string;
  description: string;
  type: StoryType;
  priority: Priority;
  acceptanceCriteria?: string;
}

// ─── Generic heuristics (used by both parsers) ────────────────────────────────

function classifyType(text: string): StoryType {
  const lower = text.toLowerCase();
  if (/\b(bug|defect|fix|error|crash|broken|regression|issue)\b/.test(lower)) return 'bug';
  if (/\b(task|todo|chore|setup|configure|install|deploy|update|migrate|refactor)\b/.test(lower)) return 'task';
  return 'story';
}

function classifyPriority(text: string): Priority {
  const lower = text.toLowerCase();
  if (/\b(critical|blocker|p0|urgent|asap|showstopper)\b/.test(lower)) return 'critical';
  if (/\b(high|important|p1|must[- ]have)\b/.test(lower)) return 'high';
  if (/\b(low|minor|nice[- ]to[- ]have|p3|trivial)\b/.test(lower)) return 'low';
  return 'medium';
}

function isUnderlined(lines: string[], idx: number): boolean {
  if (idx + 1 >= lines.length) return false;
  const next = lines[idx + 1];
  return /^[=\-]{3,}$/.test(next.trim());
}

function isNumberedSection(line: string): boolean {
  return /^(\d+\.)+\s+\S/.test(line.trim());
}

// ─── Template format parser ───────────────────────────────────────────────────
// Handles documents that follow the AI Factory USER_STORY_TEMPLATE.md structure:
//   # User Story: {Title}
//   **Story ID**: ...   **Priority**: ...   **Layer**: ...
//   ## User Story  (As a... I want... So that...)
//   ## Acceptance Criteria
//
// Each "# User Story:" heading is one story. Multiple stories per file are supported.

// Template detected when the document has a "## User Story" section heading —
// universal signal regardless of how the top-level title is formatted.
// Covers both "# User Story: Title" and "# 001-STORY-001: Title" variants.
function isTemplateFormat(text: string): boolean {
  return /^##\s+User Story\s*$/im.test(text) || /^#\s+User Story\s*:/im.test(text);
}

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function mapLayerToType(layer: string): StoryType {
  const l = layer.toLowerCase().trim();
  if (/frontend|ui/.test(l)) return 'story';
  if (/backend|api|devops|infrastructure|documentation/.test(l)) return 'task';
  return 'story';
}

function mapPriorityLabel(value: string): Priority {
  const v = value.toLowerCase().trim();
  if (v === 'critical' || v === 'p0') return 'critical';
  if (v === 'high'     || v === 'p1') return 'high';
  if (v === 'low'      || v === 'p3') return 'low';
  return 'medium'; // covers: medium, p2, and anything unrecognised
}

function extractTemplateSection(block: string, heading: string): string {
  // Captures content after "## {heading}" until the next "##" heading or "---" separator
  const pattern = new RegExp(
    `##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|\\n---\\s*(?:\\n|$)|$)`,
    'i',
  );
  const match = block.match(pattern);
  if (!match) return '';
  return stripHtmlComments(match[1]).trim();
}

/**
 * Convert plain bullet lines into GitHub-flavored checklist items so the
 * Acceptance Criteria checklist component renders them as interactive
 * checkboxes. Lines that already use `- [ ]` / `- [x]` are left untouched.
 * Numbered items, headings, and free text pass through unchanged.
 */
function toChecklistMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*)-\s+(.*)$/);
      if (!m) return line;
      const [, indent, rest] = m;
      if (/^\[[ xX]\]\s+/.test(rest)) return line;
      return `${indent}- [ ] ${rest}`;
    })
    .join('\n');
}

function parseTemplateBlock(block: string, localId: string): DraftStory | null {
  // Match any top-level "# " heading (not ## or deeper)
  const headingMatch = block.match(/^#(?!#)\s+(.+)/m);
  if (!headingMatch) return null;

  // Must contain at least one template signal to avoid treating arbitrary docs as stories
  const hasUserStorySection = /^##\s+User Story\s*$/im.test(block);
  const hasFrontMatter      = /\*\*(Priority|Layer|Story ID|Epic)\*\*/i.test(block);
  if (!hasUserStorySection && !hasFrontMatter) return null;

  // Strip "User Story: " prefix when present, keep everything else as-is
  const title = headingMatch[1].trim().replace(/^User Story\s*:\s*/i, '');

  // Pull structured metadata from bold key-value front matter
  const priorityMatch = block.match(/\*\*Priority\*\*\s*:\s*([^\n*]+)/i);
  const layerMatch    = block.match(/\*\*Layer\*\*\s*:\s*([^\n*]+)/i);

  const priority: Priority = priorityMatch ? mapPriorityLabel(priorityMatch[1]) : classifyPriority(block);
  const type: StoryType    = layerMatch    ? mapLayerToType(layerMatch[1])       : classifyType(block);

  // Build description: User Story (As a...) + Description.
  // Acceptance Criteria is split into its own field so the story gets a real
  // acceptanceCriteria column instead of a long blob in description.
  const parts: string[] = [];

  const userStory = extractTemplateSection(block, 'User Story');
  if (userStory) parts.push(userStory);

  const description = extractTemplateSection(block, 'Description');
  if (description) parts.push(description);

  const criteria = extractTemplateSection(block, 'Acceptance Criteria');

  return {
    localId,
    title,
    description: parts.join('\n\n'),
    type,
    priority,
    acceptanceCriteria: criteria ? toChecklistMarkdown(criteria) : undefined,
  };
}

function parseTemplateDocument(text: string): DraftStory[] {
  // Split on every top-level "# " heading — covers all title variants
  const blocks = text
    .split(/(?=^#(?!#)\s)/m)
    .filter((b) => /^#(?!#)\s/m.test(b));

  return blocks
    .map((block, idx) => parseTemplateBlock(block, String(idx + 1)))
    .filter((s): s is DraftStory => s !== null);
}

// ─── Generic section parser (original logic, unchanged) ──────────────────────

function parseGenericDocument(text: string): DraftStory[] {
  const rawLines = text.split('\n');
  const sections: Array<{ heading: string; bodyLines: string[] }> = [];
  let current: { heading: string; bodyLines: string[] } | null = null;
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];

    const mdMatch = line.match(/^#{1,3}\s+(.+)/);
    if (mdMatch) {
      if (current) sections.push(current);
      current = { heading: mdMatch[1].trim(), bodyLines: [] };
      i++;
      continue;
    }

    if (line.trim() && isUnderlined(rawLines, i)) {
      if (current) sections.push(current);
      current = { heading: line.trim(), bodyLines: [] };
      i += 2;
      continue;
    }

    if (isNumberedSection(line)) {
      if (current) sections.push(current);
      current = { heading: line.trim(), bodyLines: [] };
      i++;
      continue;
    }

    if (current) {
      current.bodyLines.push(line);
    } else if (line.trim()) {
      current = { heading: line.trim(), bodyLines: [] };
    }
    i++;
  }
  if (current) sections.push(current);

  // Fallback: split on double newlines if only one section found
  if (sections.length <= 1 && text.trim()) {
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (paragraphs.length > 1) {
      sections.length = 0;
      for (const para of paragraphs) {
        const [firstLine, ...rest] = para.split('\n');
        sections.push({ heading: firstLine.trim(), bodyLines: rest });
      }
    }
  }

  return sections
    .filter((s) => s.heading.trim())
    .map((s, idx) => {
      const description = s.bodyLines.join('\n').trim();
      const fullText = s.heading + ' ' + description;
      return {
        localId: String(idx + 1),
        title: s.heading,
        description,
        type: classifyType(fullText),
        priority: classifyPriority(fullText),
      };
    });
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Splits raw text into draft story sections.
 *
 * If the document follows the AI Factory user story template format
 * (starts with "# User Story:"), each top-level story block is parsed
 * as one draft — pulling title, priority, and type from structured
 * front matter instead of heuristics.
 *
 * All other documents fall through to the generic heading/paragraph splitter.
 */
export function parseSections(text: string): DraftStory[] {
  if (isTemplateFormat(text)) return parseTemplateDocument(text);
  return parseGenericDocument(text);
}
