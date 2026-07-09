// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Block-level video node for the rich-text description/comment editor.
 *
 * TipTap ships an Image extension but nothing for video, so uploaded .mp4/.mov/
 * .webm files had no node to live in and were silently dropped. This node
 * renders a native `<video controls>` element — same storage model as images
 * (we keep an attachment URL in `src`), just a different render surface.
 *
 * `atom: true` makes it a single, self-contained block (no editable children),
 * which is exactly how an Image behaves; `draggable` lets users reorder it.
 */
export const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'video[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'video',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        controlsList: 'nodownload',
        preload: 'metadata',
      }),
    ];
  },
});
