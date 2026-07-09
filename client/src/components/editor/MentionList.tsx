// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  label: string;
  email?: string | null;
}

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  items: MentionItem[];
  command: (item: { id: string; label: string }) => void;
}

export const MentionList = forwardRef<MentionListHandle, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  const select = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    command({ id: item.id, label: item.label });
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
        No matching members
      </div>
    );
  }

  return (
    <div className="flex max-h-64 w-64 flex-col overflow-y-auto rounded-md border bg-card p-1 text-card-foreground shadow-md">
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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold uppercase text-primary">
            {item.label.slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{item.label}</span>
            {item.email && (
              <span className="block truncate text-[11px] text-muted-foreground">{item.email}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});

MentionList.displayName = 'MentionList';
