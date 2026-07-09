// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

type AnyNode = { type?: string; attrs?: Record<string, unknown>; content?: AnyNode[] };

export function extractMentionUserIds(body: string | null | undefined): string[] {
  if (!body) return [];
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return [];
  let doc: AnyNode | null = null;
  try {
    doc = JSON.parse(trimmed) as AnyNode;
  } catch {
    return [];
  }
  if (!doc) return [];
  const ids = new Set<string>();
  const walk = (n: AnyNode) => {
    if (n.type === 'mention') {
      const id = n.attrs?.id;
      if (typeof id === 'string' && id) ids.add(id);
    }
    if (n.content) for (const child of n.content) walk(child);
  };
  walk(doc);
  return Array.from(ids);
}
