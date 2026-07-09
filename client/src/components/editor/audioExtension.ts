// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Block-level audio node for the rich-text description/comment editor.
 *
 * Mirrors {@link ./videoExtension Video}: TipTap has no audio node, so dropped/
 * pasted/picked .mp3/.wav/.ogg/.m4a files had nowhere to render. This emits a
 * native `<audio controls>` element pointing at the stored attachment URL.
 */
export const Audio = Node.create({
  name: 'audio',
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
    return [{ tag: 'audio[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'audio',
      mergeAttributes(HTMLAttributes, {
        controls: 'true',
        controlsList: 'nodownload',
        preload: 'metadata',
      }),
    ];
  },
});
