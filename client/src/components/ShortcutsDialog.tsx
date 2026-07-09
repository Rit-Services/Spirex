// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect } from 'react';
import { Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canCreate: boolean;
  canDelete: boolean;
}

interface ShortcutRow {
  keys: string[];
  label: string;
  scope: 'global' | 'project' | 'storyList' | 'backlog';
  show?: boolean;
}

// Cmd on macOS, Ctrl elsewhere. Resolved at runtime so the cheat-sheet matches
// the user's actual keyboard.
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? '⌘' : 'Ctrl';
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  canCreate,
  canDelete,
}: ShortcutsDialogProps) {
  const mod = modKey();

  const rows: ShortcutRow[] = [
    // ── Global (work on every page)
    { keys: ['?'], label: 'Show this cheat-sheet', scope: 'global' },
    { keys: [mod, 'K'], label: 'Open the global search palette', scope: 'global' },
    { keys: ['c'], label: 'Create a new issue', scope: 'global', show: canCreate },
    { keys: ['Shift', 'R'], label: 'Show issues I reported', scope: 'global' },

    // ── Project-scoped (filters the page you're already on)
    {
      keys: ['Shift', 'A'],
      label: 'Filter the current page to issues assigned to me',
      scope: 'project',
    },

    // ── Story-list pages (Backlog, Board, SprintDetail, EpicDetail)
    { keys: ['/'], label: 'Focus the in-page search box', scope: 'storyList' },
    { keys: ['f'], label: 'Toggle the filter panel', scope: 'storyList' },

    // ── Backlog only — selection / bulk-action shortcuts
    { keys: ['Esc'], label: 'Clear the current selection', scope: 'backlog' },
    { keys: [mod, 'A'], label: 'Select every visible issue', scope: 'backlog' },
    { keys: ['Shift', 'click'], label: 'Range-select between two checkboxes', scope: 'backlog' },
    { keys: ['Del'], label: 'Bulk-delete selected issues', scope: 'backlog', show: canDelete },
  ];

  const visible = rows.filter((r) => r.show !== false);
  const globalRows = visible.filter((r) => r.scope === 'global');
  const projectRows = visible.filter((r) => r.scope === 'project');
  const storyListRows = visible.filter((r) => r.scope === 'storyList');
  const backlogRows = visible.filter((r) => r.scope === 'backlog');

  // Close cooperatively when the feedback flow starts — see RJ-9. Without
  // this, clicking Feedback while this dialog is open races between Radix's
  // dismiss-on-outside-pointerdown and the Feedback button's click handler,
  // sometimes swallowing the open() call.
  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(false);
    window.addEventListener('feedback:open', close);
    return () => window.removeEventListener('feedback:open', close);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        onPointerDownOutside={(e) => {
          // Keep the dialog mounted when the pointerdown originated from
          // the Feedback trigger. Radix wraps the original pointer event
          // inside `detail.originalEvent`, which holds the real target.
          // The global `feedback:open` listener above closes us
          // once the screenshot capture has started, which keeps the
          // single-click contract intact.
          const target = (e.detail.originalEvent.target as HTMLElement | null) ?? null;
          if (target?.closest?.('[data-feedback-trigger]')) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const original = (e.detail as { originalEvent?: Event }).originalEvent;
          const target = (original?.target as HTMLElement | null) ?? null;
          if (target?.closest?.('[data-feedback-trigger]')) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>
            Shortcuts are ignored while you&rsquo;re typing in a text field. Press{' '}
            <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">?</kbd> at any
            time to reopen this list.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          <ShortcutGroup title="Global" rows={globalRows} />
          <ShortcutGroup
            title="Inside a project"
            subtitle="Filters the page you're on — Backlog stays on Backlog, Board on Board, etc."
            rows={projectRows}
          />
          <ShortcutGroup
            title="Story-list pages"
            subtitle="Active on Backlog, Board, Sprint detail, and Epic detail."
            rows={storyListRows}
          />
          <ShortcutGroup
            title="Backlog only"
            subtitle="Selection + bulk-action shortcuts. Backlog is the one flat list where these make sense."
            rows={backlogRows}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutGroup({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: ShortcutRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground/70">{subtitle}</p>
        ) : null}
      </div>
      <ul className="divide-y rounded-md border bg-muted/30 text-sm">
        {rows.map((r) => (
          <li
            key={`${title}-${r.label}`}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <span className="text-foreground">{r.label}</span>
            <span className="flex items-center gap-1">
              {r.keys.map((k, i) => (
                <span key={`${r.label}-${i}`} className="flex items-center gap-1">
                  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-background px-1.5 font-mono text-[11px] text-muted-foreground shadow-sm">
                    {k}
                  </kbd>
                  {i < r.keys.length - 1 ? (
                    <span className="text-[10px] text-muted-foreground">+</span>
                  ) : null}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
