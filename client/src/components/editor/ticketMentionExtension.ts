// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import {
  TicketMentionList,
  type TicketItem,
  type TicketMentionListHandle,
} from './TicketMentionList';

// Chip style shared by the editor and the read-only renderer. font-mono because
// the visible label is a story key (RIT-42); a tint distinct from user mentions
// so "@person" and "#ticket" read differently at a glance.
const CHIP_CLASS =
  'inline-flex items-center rounded bg-sky-500/12 px-1 py-px font-mono text-[0.85em] font-medium text-sky-600 dark:text-sky-400';

// A SECOND Mention node type living on the same editor as the @-mention: it
// must have its own node `name` AND its own suggestion PluginKey — with the
// defaults the two suggestion plugins collide and one silently stops firing.
const TicketMentionNode = Mention.extend({
  name: 'ticketMention',
  addAttributes() {
    return {
      ...this.parent?.(),
      // Carried on the node so the read-only renderer can build the
      // /projects/:id/stories/:key link without knowing the page context.
      projectId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-project-id'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.projectId ? { 'data-project-id': attributes.projectId as string } : {},
      },
    };
  },
});

export function buildTicketMentionExtension(getItems: () => TicketItem[]) {
  return TicketMentionNode.configure({
    HTMLAttributes: { class: CHIP_CLASS },
    renderText({ node }) {
      return `#${(node.attrs.label as string | undefined) ?? (node.attrs.id as string)}`;
    },
    suggestion: {
      char: '#',
      pluginKey: new PluginKey('ticketMentionSuggestion'),
      items: ({ query }) => {
        const q = query.trim().toLowerCase();
        const all = getItems();
        if (!q) return all.slice(0, 8);
        return all
          .filter((t) => `${t.key} ${t.title}`.toLowerCase().includes(q))
          .slice(0, 8);
      },
      render: () => {
        let component: ReactRenderer<TicketMentionListHandle> | null = null;
        let popup: TippyInstance[] = [];

        return {
          onStart: (props) => {
            component = new ReactRenderer(TicketMentionList, {
              props,
              editor: props.editor,
            });
            if (!props.clientRect) return;
            popup = tippy('body', {
              getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
              appendTo: () => document.body,
              content: component.element,
              showOnCreate: true,
              interactive: true,
              trigger: 'manual',
              placement: 'bottom-start',
            });
          },
          onUpdate: (props) => {
            component?.updateProps(props);
            if (!props.clientRect) return;
            popup[0]?.setProps({
              getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
            });
          },
          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              popup[0]?.hide();
              return true;
            }
            return component?.ref?.onKeyDown(props.event) ?? false;
          },
          onExit: () => {
            popup[0]?.destroy();
            component?.destroy();
            component = null;
            popup = [];
          },
        };
      },
    },
  });
}

// Read-only variant renders the tag as a REAL anchor — the view editor is
// non-editable, so a native link is the click-through. Opens in a new tab to
// keep the comment thread the user is reading (same convention as opening
// tickets from the backlog/board). The href is built here from a fixed
// template, never from raw comment HTML, so no scheme injection is possible.
export const ReadOnlyTicketMention = TicketMentionNode.configure({
  HTMLAttributes: { class: CHIP_CLASS },
  renderText({ node }) {
    return `#${(node.attrs.label as string | undefined) ?? (node.attrs.id as string)}`;
  },
  renderHTML({ options, node }) {
    const key = (node.attrs.label as string | null) ?? '';
    const projectId = (node.attrs.projectId as string | null) ?? '';
    if (!key || !projectId) {
      // Tag saved without a resolvable target — render the chip, just not a link.
      return ['span', options.HTMLAttributes, `#${key || (node.attrs.id as string)}`];
    }
    return [
      'a',
      {
        ...options.HTMLAttributes,
        href: `/projects/${projectId}/stories/${encodeURIComponent(key)}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        'data-type': 'ticketMention',
        'data-id': node.attrs.id as string,
        'data-project-id': projectId,
      },
      `#${key}`,
    ];
  },
});
