// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  name: string | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// Deterministic color per name — stable across renders.
function colorFor(name: string) {
  const palette = [
    'bg-blue-600',
    'bg-emerald-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-amber-600',
    'bg-cyan-600',
    'bg-indigo-600',
    'bg-teal-600',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function Avatar({ name, size = 'sm', className, title }: AvatarProps): ReactNode {
  const label = name?.trim() || '?';
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  const bg = name ? colorFor(label) : 'bg-muted';
  return (
    <span
      title={title ?? label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-border',
        dim,
        bg,
        className,
      )}
    >
      {initials(label)}
    </span>
  );
}
