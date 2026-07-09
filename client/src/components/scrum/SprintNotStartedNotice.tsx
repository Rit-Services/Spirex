// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Whether the current user holds the `sprint:start` permission in this project.
   *  Drives the message: actionable when true, "ask a lead" when false. */
  canStart: boolean;
  /** Tighter padding + full-width borders, for embedding inside a backlog lane. */
  compact?: boolean;
  className?: string;
}

/**
 * Soft, non-blocking notice shown when a sprint is still in `planned` status.
 *
 * Replaces the old "forbidden cursor + dimmed card" affordance: rather than
 * silently blocking the user, it explains that the sprint hasn't started — and,
 * when the user can't start it themselves, points them at a project lead.
 */
export function SprintNotStartedNotice({ canStart, compact, className }: Props) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        compact ? 'border-y px-3 py-1.5 text-[11px]' : 'rounded-md border px-3 py-2 text-xs',
        className,
      )}
    >
      <AlertCircle
        className={cn('mt-px shrink-0', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
        aria-hidden
      />
      <p className="flex-1 leading-snug">
        <span className="font-medium">This sprint hasn&rsquo;t started yet.</span>{' '}
        <span className="opacity-80">
          {canStart
            ? 'Start the sprint to begin tracking work on these stories.'
            : 'Ask your project lead to start the sprint to begin work on these stories.'}
        </span>
      </p>
    </div>
  );
}
