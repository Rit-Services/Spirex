// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Bug, CheckSquare, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryType } from '@/types/scrum';

export function StoryTypeIcon({
  type,
  className,
}: {
  type: StoryType;
  className?: string;
}) {
  if (type === 'bug') {
    return (
      <Bug
        className={cn('h-3.5 w-3.5 !text-red-600', className)}
        aria-label="Bug"
        role="img"
      />
    );
  }
  if (type === 'task') {
    return (
      <CheckSquare
        className={cn('h-3.5 w-3.5 !text-sky-600', className)}
        aria-label="Task"
        role="img"
      />
    );
  }
  return (
    <Bookmark
      className={cn('h-3.5 w-3.5 !text-emerald-600', className)}
      aria-label="Story"
      role="img"
    />
  );
}
