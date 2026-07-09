// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { ChevronUp, ChevronsUp, ChevronDown, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Priority } from '@/types/scrum';

const meta: Record<Priority, { label: string; color: string; Icon: typeof ChevronUp }> = {
  low:      { label: 'Low',      color: 'text-slate-500',   Icon: ChevronDown },
  medium:   { label: 'Medium',   color: 'text-amber-600',   Icon: ChevronUp },
  high:     { label: 'High',     color: 'text-orange-600',  Icon: ChevronsUp },
  critical: { label: 'Critical', color: 'text-red-600',     Icon: Flame },
};

export function PriorityBadge({ priority, showLabel = false }: { priority: Priority; showLabel?: boolean }) {
  const m = meta[priority];
  const Icon = m.Icon;
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', m.color)}
      title={`Priority: ${m.label}`}
      aria-label={`Priority ${m.label}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {showLabel ? m.label : null}
    </span>
  );
}
