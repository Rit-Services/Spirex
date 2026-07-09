// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Search, UserPlus, UserX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export interface UserPickerOption {
  id: string;
  name: string;
  email?: string;
  /** Display text override (e.g. "Name (unlinked)"); the avatar still uses `name`. */
  label?: string;
}

interface UserPickerProps {
  /** Selected user id, or null when nothing is chosen / unassigned. */
  value: string | null;
  options: UserPickerOption[];
  onChange: (id: string | null) => void;
  /** Show an "Unassigned" choice (assignee field) — omit for required fields. */
  allowUnassign?: boolean;
  unassignLabel?: string;
  /** A selected value not present in `options` (e.g. an imported/unlinked user). */
  extraOption?: UserPickerOption | null;
  /** When set, shows an "Assign to me" shortcut (used on cards). */
  currentUserId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
  /** Custom trigger (e.g. a card avatar). Falls back to a select-style button. */
  trigger?: ReactNode;
}

/**
 * Searchable user picker — a Popover with a filter box and an avatar+name list.
 * Replaces a plain <Select> for assignee/reporter so large teams are searchable
 * (Radix Select can't host a search input). Trigger mirrors the chosen user's
 * avatar + name, matching how members read on the cards.
 */
export function UserPicker({
  value,
  options,
  onChange,
  allowUnassign = false,
  unassignLabel = 'Unassigned',
  extraOption = null,
  currentUserId = null,
  disabled = false,
  placeholder = 'Select…',
  className,
  align = 'start',
  trigger,
}: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  // Fold in the extra option so the current selection always resolves to a row.
  const allOptions = useMemo(() => {
    if (extraOption && !options.some((o) => o.id === extraOption.id)) {
      return [...options, extraOption];
    }
    return options;
  }, [options, extraOption]);

  const selected = allOptions.find((o) => o.id === value) ?? null;
  const me = currentUserId ? allOptions.find((o) => o.id === currentUserId) ?? null : null;
  // Shortcuts (Me / Unassign) only make sense before the user starts filtering.
  const showQuickRows = !query.trim();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.label?.toLowerCase().includes(q) ?? false) ||
        (o.email?.toLowerCase().includes(q) ?? false),
    );
  }, [allOptions, query]);

  const choose = (id: string | null) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm',
              'transition-colors hover:border-primary/35 hover:bg-muted/30',
              'focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/18',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected ? (
                <>
                  <Avatar name={selected.name} />
                  <span className="truncate">{selected.label ?? selected.name}</span>
                </>
              ) : allowUnassign ? (
                <>
                  <Avatar name={null} />
                  <span className="truncate text-muted-foreground">{unassignLabel}</span>
                </>
              ) : (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0"
      >
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {showQuickRows && me && me.id !== value ? (
            <button
              type="button"
              onClick={() => choose(me.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <UserPlus className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate">Assign to me</span>
            </button>
          ) : null}
          {showQuickRows && allowUnassign ? (
            <button
              type="button"
              onClick={() => choose(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserX className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate text-muted-foreground">{unassignLabel}</span>
              {value === null ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </button>
          ) : null}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => choose(o.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
            >
              <Avatar name={o.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label ?? o.name}</span>
                {o.email ? (
                  <span className="block truncate text-[11px] text-muted-foreground">{o.email}</span>
                ) : null}
              </span>
              {value === o.id ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No people match.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
