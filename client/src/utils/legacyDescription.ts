// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Backwards-compatible description reader.
 *
 * Phases 1–7 stored descriptions as plain markdown strings. Phase 8 switches
 * to TipTap JSON (serialized). On read:
 *   - if the string parses as a valid JSON doc → return as-is.
 *   - otherwise wrap the legacy text as a single TipTap paragraph document.
 *
 * The next save from the rich editor will upgrade the row to full JSON.
 */

export type TiptapDoc = {
  type: 'doc';
  content?: TiptapNode[];
};

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export const EMPTY_DOC: TiptapDoc = { type: 'doc', content: [] };

export function parseDescription(raw: string | null | undefined): TiptapDoc {
  if (raw == null || raw === '') return EMPTY_DOC;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && obj.type === 'doc') return obj as TiptapDoc;
    } catch {
      // fall through to legacy wrapping
    }
  }
  // Legacy: split on blank lines, each block becomes its own paragraph.
  const paragraphs = trimmed.split(/\n\s*\n/);
  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.replace(/\n/g, ' ') }],
    })),
  };
}

export function stringifyDescription(doc: TiptapDoc | null | undefined): string | null {
  if (!doc) return null;
  // Treat an empty doc as null so we don't bloat the DB.
  const empty =
    !doc.content ||
    doc.content.length === 0 ||
    (doc.content.length === 1 &&
      doc.content[0]?.type === 'paragraph' &&
      (!doc.content[0].content || doc.content[0].content.length === 0));
  if (empty) return null;
  return JSON.stringify(doc);
}

/**
 * Collect the attachment ids referenced by media nodes in a doc, by parsing the
 * `/api/attachments/<id>/file` URL out of each node's `src`. Used to reconcile
 * inline uploads on save — anything uploaded but no longer referenced here is an
 * orphan to be deleted.
 */
export function collectAttachmentIds(doc: TiptapDoc | null | undefined): string[] {
  if (!doc?.content) return [];
  const ids = new Set<string>();
  const re = /\/api\/attachments\/([A-Za-z0-9_-]+)\/file/;
  const walk = (nodes: TiptapNode[]) => {
    for (const n of nodes) {
      const src = n.attrs?.src;
      if (typeof src === 'string') {
        const m = re.exec(src);
        if (m) ids.add(m[1]);
      }
      if (n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return [...ids];
}

/** Pull plain text out of a TipTap doc — used for accessibility fallbacks. */
export function docToPlainText(doc: TiptapDoc | null | undefined): string {
  if (!doc?.content) return '';
  const parts: string[] = [];
  const walk = (nodes: TiptapNode[]) => {
    for (const n of nodes) {
      if (n.type === 'text' && n.text) parts.push(n.text);
      if (n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return parts.join(' ');
}
