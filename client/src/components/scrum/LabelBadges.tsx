// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { LabelChip } from '@/types/scrum';
import { hexWithAlpha } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';

interface LabelBadgesProps {
  labels: LabelChip[] | undefined;
  /** Cap how many render before collapsing into a "+N" chip. 0 = no cap. */
  max?: number;
  className?: string;
}

/**
 * Renders a story's labels as compact tinted pills — the same visual language as
 * the backlog epic chip (16%-alpha background, solid-color text). Reused on the
 * board card, the backlog tile, and the story detail panel so labels read the
 * same everywhere. Renders nothing when there are no labels.
 */
export function LabelBadges({ labels, max = 0, className }: LabelBadgesProps) {
  if (!labels || labels.length === 0) return null;
  const shown = max > 0 ? labels.slice(0, max) : labels;
  const overflow = max > 0 ? labels.length - shown.length : 0;

  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((l) => (
        <span
          key={l.id}
          className="inline-flex h-[18px] max-w-[140px] shrink-0 items-center truncate rounded-sm px-1.5 text-[10px] font-semibold"
          style={{ backgroundColor: hexWithAlpha(l.color, 0.16), color: l.color }}
          title={`Label · ${l.name}`}
        >
          {l.name}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="inline-flex h-[18px] shrink-0 items-center rounded-sm bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground"
          title={labels.slice(shown.length).map((l) => l.name).join(', ')}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
