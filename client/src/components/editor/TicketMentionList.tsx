// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TicketItem {
  /** Story id — stored on the node for stable identity. */
  id: string;
  /** Story key (e.g. RIT-42) — what the chip displays. */
  key: string;
  title: string;
  projectId: string;
}

export interface TicketMentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  items: TicketItem[];
  command: (attrs: { id: string; label: string; projectId: string }) => void;
}

/** Suggestion dropdown for `#` ticket tags — sibling of MentionList (`@`). */
export const TicketMentionList = forwardRef<TicketMentionListHandle, Props>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const select = (idx: number) => {
      const item = items[idx];
      if (!item) return;
      command({ id: item.id, label: item.key, projectId: item.projectId });
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          select(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="rounded-md border bg-card px-2 py-1.5 text-xs text-muted-foreground shadow-md">
          No matching issues
        </div>
      );
    }

    return (
      <div className="flex max-h-64 w-72 flex-col overflow-y-auto rounded-md border bg-card p-1 text-card-foreground shadow-md">
        {items.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => select(idx)}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
              idx === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
            )}
          >
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              {item.key}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{item.title}</span>
          </button>
        ))}
      </div>
    );
  },
);

TicketMentionList.displayName = 'TicketMentionList';
