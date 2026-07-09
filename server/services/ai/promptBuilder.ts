// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Annotation } from '../ingest/imageImportService.js';

export interface GeneratedStory {
  title: string;
  description: string;
  acceptanceCriteria: string;
}

const SYSTEM = `You are a senior product manager writing a single Agile user story from an annotated UI screenshot.
You will be given:
1. A screenshot file path (the image is real — read it).
2. A numbered list of annotations the user drew on the image, each with a short comment.

Your job: produce ONE user story that captures the intent of all annotations together.
Do NOT produce one story per annotation — synthesize them into a single coherent story.

Output STRICTLY a JSON object on a single line, with these keys:
  - title: string, <= 80 chars, imperative voice ("Add ...", "Fix ...", "Allow user to ...")
  - description: markdown string, 2-6 sentences explaining the user-visible problem or feature, optionally referencing the annotations by number (e.g. "(see #2)")
  - acceptanceCriteria: markdown checklist of 3-6 items, each line starting with "- [ ] "

NO prose before or after the JSON. NO code fences. NO commentary. Output the JSON object only.

CRITICAL — the output must be parseable by a strict JSON parser (JSON.parse): inside every string value, write line breaks as the two characters \n (backslash n), NEVER an actual newline; escape any double quote inside text as \". A markdown checklist therefore becomes one JSON string like "- [ ] First\n- [ ] Second".`;

export function buildPrompt(input: {
  imagePath: string;
  filename: string;
  annotations: Annotation[];
}): { system: string; user: string } {
  const ann = input.annotations.length
    ? input.annotations
        .map((a, i) => {
          const where =
            a.shape === 'arrow'
              ? `arrow from (${Math.round(a.x)},${Math.round(a.y)}) to (${Math.round(a.x2 ?? a.x)},${Math.round(a.y2 ?? a.y)})`
              : a.shape === 'rect'
                ? `rect at (${Math.round(a.x)},${Math.round(a.y)}) ${Math.round(a.width ?? 0)}x${Math.round(a.height ?? 0)}`
                : `label at (${Math.round(a.x)},${Math.round(a.y)})`;
          const comment = a.text.trim() || '(no comment)';
          return `${i + 1}. [${a.shape}] ${where} — ${comment}`;
        })
        .join('\n')
    : '(no annotations — use the screenshot alone to infer intent)';

  const user = `Screenshot file: ${input.imagePath}
Filename: ${input.filename}

Annotations on the image:
${ann}

Read the screenshot and synthesize ONE user story. Output JSON only.`;

  return { system: SYSTEM, user };
}

/**
 * Tolerant JSON extraction. Claude may return clean JSON, or wrap it in
 * ```json fences, or print stray text around it. Try in order:
 *   1. Direct JSON.parse
 *   2. Strip ```json fences then parse
 *   3. Locate first '{' ... matching '}' substring then parse
 */
/**
 * Repair the single most common way a model breaks otherwise-valid JSON:
 * putting LITERAL newlines / carriage returns / tabs inside a string value
 * (e.g. a multi-line markdown checklist) instead of the escaped `\n`. Strict
 * JSON forbids raw control characters in strings, so `JSON.parse` rejects them.
 * We walk the text tracking whether we're inside a string literal (respecting
 * backslash escapes) and escape any bare control chars we find there. Used only
 * as a last-resort fallback, after a direct parse has already failed.
 */
function escapeControlCharsInStrings(s: string): string {
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      out += ch;
      continue;
    }
    if (inStr) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** Best candidate JSON object slice from a raw model response (fences stripped, outer braces). */
function extractJsonSlice(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start !== -1 && end > start ? body.slice(start, end + 1) : body;
}

export function parseGeneratedStory(raw: string): GeneratedStory {
  const tryParse = (s: string): GeneratedStory | null => {
    try {
      const obj = JSON.parse(s);
      if (
        obj &&
        typeof obj.title === 'string' &&
        typeof obj.description === 'string' &&
        typeof obj.acceptanceCriteria === 'string'
      ) {
        return {
          title: obj.title.trim(),
          description: obj.description.trim(),
          acceptanceCriteria: obj.acceptanceCriteria.trim(),
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    const fromFence = tryParse(fenced[1].trim());
    if (fromFence) return fromFence;
  }

  const slice = extractJsonSlice(raw);
  const fromSlice = tryParse(slice);
  if (fromSlice) return fromSlice;

  // Last resort: the model emitted raw (unescaped) newlines/tabs inside string
  // values — common with non-Claude models. Escape control chars within the
  // string literals and retry.
  const repaired = tryParse(escapeControlCharsInStrings(slice));
  if (repaired) return repaired;

  throw new Error(
    `AI did not return valid story JSON. First 200 chars: ${raw.slice(0, 200)}`,
  );
}

// ── Voice-import prompt ─────────────────────────────────────────────────────
// Per decision D7 in docs/phase12-voice-import.md, we feed Claude the English
// translation as the primary input. The original-language transcript is
// included as supplementary context only when it differs from English — it
// helps Claude recover from translation drops without re-translating.

const VOICE_SYSTEM = `You are a senior product manager turning a stakeholder's transcribed voice note into a single Agile user story.

You will be given:
1. The note as a transcript. An English translation is included so you can ground the story content in English regardless of the source language.
2. The detected source language as context about the speaker.

Your job: produce ONE user story that captures the intent of the note.
Do NOT produce multiple stories. Synthesize into one coherent story.
Write in English regardless of the source language.

The reader will already have access to the raw transcripts attached to the story, so do NOT quote them verbatim — synthesize the intent.

Output STRICTLY a JSON object on a single line, with these keys:
  - title: string, <= 80 chars, imperative voice ("Add ...", "Fix ...", "Allow user to ...")
  - description: markdown string, 2-6 sentences describing the user-visible problem or feature
  - acceptanceCriteria: markdown checklist of 3-6 items, each line starting with "- [ ] "

NO prose before or after the JSON. NO code fences. NO commentary. Output the JSON object only.

CRITICAL — the output must be parseable by a strict JSON parser (JSON.parse): inside every string value, write line breaks as the two characters \n (backslash n), NEVER an actual newline; escape any double quote inside text as \". A markdown checklist therefore becomes one JSON string like "- [ ] First\n- [ ] Second".`;

// ── Ticket enhancement prompts ──────────────────────────────────────────────
// Both take an EXISTING ticket as context. Crucially, neither output is saved
// directly — the server returns a draft and the user confirms in the UI, so
// the prompt favors faithfulness to the original intent over creativity.

export interface StoryEnhanceContext {
  key: string;
  title: string;
  type: string;
  priority: string;
  projectName?: string | null;
  epicTitle?: string | null;
  description?: string | null;
  acceptanceCriteria?: string | null;
  subtaskTitles?: string[];
}

const ENHANCE_SYSTEM = `You are a senior product manager improving an EXISTING Agile issue.

You will be given the issue's current title, description, acceptance criteria and surrounding context (project, epic, subtasks).

Your job: rewrite the issue so it is clearer, more specific and more actionable — WITHOUT changing its intent or inventing requirements that are not implied by the context. Preserve every concrete fact (names, numbers, constraints). If the original is vague, structure what IS there; do not fabricate detail. Write in English.

Output STRICTLY a JSON object on a single line, with these keys:
  - title: string, <= 80 chars, imperative voice ("Add ...", "Fix ...", "Allow user to ...")
  - description: markdown string, 2-8 sentences (bullet points allowed) explaining the problem or feature, its context and the expected outcome
  - acceptanceCriteria: markdown checklist of 3-7 items, each line starting with "- [ ] ", testable and unambiguous

NO prose before or after the JSON. NO code fences. NO commentary. Output the JSON object only.

CRITICAL — the output must be parseable by a strict JSON parser (JSON.parse): inside every string value, write line breaks as the two characters \n (backslash n), NEVER an actual newline; escape any double quote inside text as \". A markdown checklist therefore becomes one JSON string like "- [ ] First\n- [ ] Second".`;

function describeTicket(input: StoryEnhanceContext): string {
  const parts = [
    `Issue: ${input.key} (type: ${input.type}, priority: ${input.priority})`,
    input.projectName ? `Project: ${input.projectName}` : null,
    input.epicTitle ? `Epic: ${input.epicTitle}` : null,
    '',
    `Current title: ${input.title}`,
    '',
    'Current description:',
    input.description?.trim() || '(empty)',
    '',
    'Current acceptance criteria:',
    input.acceptanceCriteria?.trim() || '(empty)',
  ];
  if (input.subtaskTitles && input.subtaskTitles.length > 0) {
    parts.push('', 'Existing subtasks:', ...input.subtaskTitles.map((t) => `- ${t}`));
  }
  return parts.filter((p): p is string => p !== null).join('\n');
}

export function buildEnhancePrompt(input: StoryEnhanceContext): {
  system: string;
  user: string;
} {
  const user = `${describeTicket(input)}

Rewrite this issue to be clearer and more actionable while preserving its intent. Output JSON only.`;
  return { system: ENHANCE_SYSTEM, user };
}

const AC_SYSTEM = `You are a senior QA engineer writing acceptance criteria for an EXISTING Agile issue.

You will be given the issue's title, description and surrounding context.

Your job: capture ONLY the core of what the issue demands, as a few short, testable checks. Be brief and to the point:
  - Focus on the essential success path — the conditions that, if met, mean the story is genuinely done. Skip minor edge cases unless one is central to the issue's intent.
  - Keep EACH item to a single short sentence (aim for under ~12 words). No sub-points, no compound "and/or" criteria, no implementation or design detail.
  - Prefer fewer, sharper criteria over exhaustive coverage. Do NOT invent requirements that are not implied by the issue.
  - If acceptance criteria already exist, tighten them rather than expanding them. Write in English.

Output STRICTLY a JSON object on a single line, with this key:
  - acceptanceCriteria: markdown checklist of 2-4 concise items, each line starting with "- [ ] ", each testable and unambiguous

NO prose before or after the JSON. NO code fences. NO commentary. Output the JSON object only.

CRITICAL — the output must be parseable by a strict JSON parser (JSON.parse): inside every string value, write line breaks as the two characters \n (backslash n), NEVER an actual newline; escape any double quote inside text as \". A markdown checklist therefore becomes one JSON string like "- [ ] First\n- [ ] Second".`;

export function buildAcceptanceCriteriaPrompt(input: StoryEnhanceContext): {
  system: string;
  user: string;
} {
  const user = `${describeTicket(input)}

Write brief, core-focused acceptance criteria for this issue — a few short checks, not exhaustive coverage. Output JSON only.`;
  return { system: AC_SYSTEM, user };
}

/** Tolerant extraction for the AC-only response, mirroring parseGeneratedStory. */
export function parseAcceptanceCriteria(raw: string): string {
  const tryParse = (s: string): string | null => {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj.acceptanceCriteria === 'string' && obj.acceptanceCriteria.trim()) {
        return obj.acceptanceCriteria.trim();
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const slice = extractJsonSlice(raw);
  const fromSlice = tryParse(slice);
  if (fromSlice) return fromSlice;

  // Last resort: repair literal control chars inside string values.
  const repaired = tryParse(escapeControlCharsInStrings(slice));
  if (repaired) return repaired;

  throw new Error(
    `AI did not return valid acceptance-criteria JSON. First 200 chars: ${raw.slice(0, 200)}`,
  );
}

export function buildVoicePrompt(input: {
  translatedText: string;
  originalText?: string | null;
  detectedLanguage?: string | null;
}): { system: string; user: string } {
  const lang = (input.detectedLanguage || 'en').trim();
  const showOriginal =
    lang !== 'en' &&
    !!input.originalText &&
    input.originalText.trim() !== input.translatedText.trim();

  const parts = [
    `Detected source language: ${lang}`,
    '',
    'Voice note transcript (English translation):',
    input.translatedText.trim(),
  ];
  if (showOriginal) {
    parts.push(
      '',
      `Original-language transcript (${lang}):`,
      (input.originalText ?? '').trim(),
    );
  }
  parts.push('', 'Synthesize into ONE user story. Output JSON only.');

  return { system: VOICE_SYSTEM, user: parts.join('\n') };
}
