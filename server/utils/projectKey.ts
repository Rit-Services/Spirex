// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Derive a JIRA-style project key from a name.
 *   "Kanban Demo Garden" → "KDG"
 *   "Orchard Ops"        → "OO"
 *   "API"                → "API"
 *
 * Collision-safety is handled at the caller (retry with numeric suffix).
 */
export function deriveKey(name: string): string {
  const words = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'PRJ';

  if (words.length === 1) {
    const w = words[0];
    if (w.length <= 4) return w;
    return w.slice(0, 4);
  }

  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join('');
}

export function withSuffix(base: string, n: number): string {
  return `${base}${n}`;
}
