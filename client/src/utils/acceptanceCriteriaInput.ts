// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

export const CHECKBOX_PREFIX = '- [ ] ';

/**
 * Ensures the acceptance-criteria text starts with a checkbox marker so the
 * user can begin typing the first item without manually adding "- [ ]".
 */
export function withInitialCheckboxPrefix(value: string | null | undefined): string {
  const text = value ?? '';
  if (text.length === 0) return CHECKBOX_PREFIX;
  return text;
}

export interface EnterInsertion {
  value: string;
  caret: number;
}

/**
 * Computes the next textarea value + caret position after the user presses
 * Enter, inserting a newline followed by the checkbox prefix so each line
 * pre-contains the marker.
 */
export function insertCheckboxNewline(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): EnterInsertion {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const insertion = `\n${CHECKBOX_PREFIX}`;
  const next = value.slice(0, start) + insertion + value.slice(end);
  return { value: next, caret: start + insertion.length };
}
