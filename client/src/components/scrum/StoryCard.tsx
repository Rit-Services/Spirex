// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { cn } from '@/lib/utils';
import type { Story } from '@/types/scrum';
import { Avatar } from '@/components/ui/avatar';
import { StoryTypeIcon } from './StoryTypeIcon';
import { PriorityBadge } from './PriorityBadge';
import { LabelBadges } from './LabelBadges';
import { EpicChip } from './EpicChip';

interface StoryCardProps {
  story: Story;
  onOpen?: (story: Story) => void;
  draggable?: boolean;
  className?: string;
}

/**
 * JIRA-style card:
 *   [epic color stripe] [title] [type icon · KEY · priority · points · assignee]
 */
export function StoryCard({ story, onOpen, className }: StoryCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(story)}
      className={cn(
        'group relative block w-full overflow-hidden rounded-md border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/50',
        className,
      )}
      aria-label={`Story ${story.key}: ${story.title}`}
      data-story-key={story.key}
    >
      {story.epic ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-1"
          style={{ backgroundColor: story.epic.color }}
        />
      ) : null}

      <div className="pl-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {story.title}
        </p>

        {(story.labels?.length ?? 0) > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <LabelBadges labels={story.labels} max={3} />
          </div>
        ) : null}

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <StoryTypeIcon type={story.type} />
          <span className="font-mono text-[11px]">{story.key}</span>
          {/* Epic sits on the right, just before the priority indicator (Jira). */}
          <span className="ml-auto flex items-center gap-2">
            {story.epic ? <EpicChip epic={story.epic} className="max-w-[110px]" /> : null}
            <PriorityBadge priority={story.priority} />
            {typeof story.storyPoints === 'number' ? (
              <span className="flex h-5 min-w-[22px] items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">
                {story.storyPoints}
              </span>
            ) : null}
            <Avatar name={story.assignee?.name ?? null} />
          </span>
        </div>
      </div>
    </button>
  );
}
