// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { hexWithAlpha } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

interface EpicChipProps {
  epic: { title: string; color: string };
  className?: string;
}

/**
 * Epic shown as a tinted pill (Jira-style), the same chip treatment as labels.
 * Placed in the card's chip row above the meta footer — where Jira surfaces the
 * epic — rather than as a heading under the title.
 */
export function EpicChip({ epic, className }: EpicChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] max-w-[160px] shrink-0 items-center truncate rounded-sm px-1.5 text-[10px] font-semibold uppercase tracking-wide',
        className,
      )}
      style={{ backgroundColor: hexWithAlpha(epic.color, 0.16), color: epic.color }}
      title={`Epic · ${epic.title}`}
    >
      {epic.title}
    </span>
  );
}
