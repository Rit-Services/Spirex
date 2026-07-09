// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Whether the current user holds `sprint:complete` in this project.
   *  Drives the message: actionable when true, "ask a lead" when false. */
  canComplete: boolean;
  /** The sprint's end date (ISO). Shown in the message and used for the
   *  "N days ago" hint. The caller only renders this notice once it's past. */
  endDate: string | null;
  /** Tighter padding + full-width borders, for embedding inside a backlog lane. */
  compact?: boolean;
  className?: string;
}

/**
 * Soft, non-blocking notice shown when an ACTIVE sprint has run past its end
 * date without being completed. Sibling to {@link SprintNotStartedNotice} — same
 * shape, but a rose tone (vs amber) so "overdue" reads distinctly from "not
 * started yet". Like that one, it nudges rather than blocks: nothing is disabled,
 * it just keeps a forgotten-open sprint from silently skewing the timeline.
 */
export function SprintOverdueNotice({ canComplete, endDate, compact, className }: Props) {
  const ended = endDate ? new Date(endDate) : null;
  // Floor of whole days since the end date — 0 means it tipped over today.
  const daysOver =
    ended ? Math.floor((Date.now() - ended.getTime()) / 86_400_000) : null;
  const agoText =
    daysOver == null
      ? ''
      : daysOver <= 0
        ? ' (ended today)'
        : ` (${daysOver} day${daysOver === 1 ? '' : 's'} ago)`;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        compact ? 'border-y px-3 py-1.5 text-[11px]' : 'rounded-md border px-3 py-2 text-xs',
        className,
      )}
    >
      <AlertTriangle
        className={cn('mt-px shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        aria-hidden
      />
      <p className="flex-1 leading-snug">
        <span className="font-medium">
          This sprint is past its end date{ended ? ` ${ended.toLocaleDateString()}` : ''}
          {agoText}.
        </span>{' '}
        <span className="opacity-80">
          {canComplete
            ? 'Complete it, or extend the end date to keep your timeline accurate.'
            : 'Ask your project lead to complete it or push out the end date.'}
        </span>
      </p>
    </div>
  );
}
