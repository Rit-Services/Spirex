// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Descriptions are stored either as legacy plain markdown or (post Phase 8) a
 * serialized TipTap JSON document. Feeding the raw JSON to an AI prompt (or
 * any text consumer) pollutes it with "doc"/"paragraph" tokens — this walks
 * the document and returns just the human text. Mirrors the inline helper in
 * searchService; extracted here for non-search callers.
 */
export function tiptapPlainText(raw: string | null | undefined): string {
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
      for (const rawNode of nodes) {
        const n = rawNode as {
          type?: string;
          text?: string;
          attrs?: { label?: string };
          content?: unknown;
        };
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
