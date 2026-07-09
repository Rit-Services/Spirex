// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import Mention from '@tiptap/extension-mention';
import { ReactRenderer } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { MentionList, type MentionItem, type MentionListHandle } from './MentionList';

export function buildMentionExtension(getItems: () => MentionItem[]) {
  return Mention.configure({
    HTMLAttributes: {
      class:
        'inline-flex items-center rounded bg-primary/12 px-1 py-px text-[0.85em] font-medium text-primary',
    },
    renderText({ node }) {
      const label = (node.attrs.label as string | undefined) ?? (node.attrs.id as string);
      return `@${label}`;
    },
    suggestion: {
      char: '@',
      items: ({ query }) => {
        const q = query.trim().toLowerCase();
        const all = getItems();
        if (!q) return all.slice(0, 8);
        return all
          .filter((item) => {
            const hay = `${item.label} ${item.email ?? ''}`.toLowerCase();
            return hay.includes(q);
          })
          .slice(0, 8);
      },
      render: () => {
        let component: ReactRenderer<MentionListHandle> | null = null;
        let popup: TippyInstance[] = [];

        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, {
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

export const ReadOnlyMention = Mention.configure({
  HTMLAttributes: {
    class:
      'inline-flex items-center rounded bg-primary/12 px-1 py-px text-[0.85em] font-medium text-primary',
  },
  renderText({ node }) {
    const label = (node.attrs.label as string | undefined) ?? (node.attrs.id as string);
    return `@${label}`;
  },
});
