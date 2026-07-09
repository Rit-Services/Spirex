// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableBoardCard } from './BoardCard';
import { columnWidthClass } from './boardLayout';
import { cn } from '@/lib/utils';
import type { Story, StoryStatus } from '@/types/scrum';

interface BoardColumnProps {
  /** Workflow row id — the specific column this drop target writes to. */
  statusRowId: string;
  /** The legacy enum value for the row — kept for optimistic updates + data-attr. */
  coreStatus: StoryStatus;
  label: string;
  /** Accent color from the workflow row — renders as a thin top stripe. */
  color?: string;
  /** When true, the column takes a fixed readable width (for the horizontally
   *  scrolling many-column layout) instead of stretching to share the row. */
  fixedWidth?: boolean;
  /** Board-driven "drop here" highlight. With closestCorners the over target is
   *  usually a card, so the column's own `isOver` won't fire — the board derives
   *  the hovered column from the target's statusRowId and passes it here. */
  highlighted?: boolean;
  stories: Story[];
  onOpenStory: (s: Story) => void;
  dropDisabled?: boolean;
  /** Sprint stories still loading — render ghost cards instead of (stale) content. */
  loading?: boolean;
  /** How many ghost cards to show while loading; varied per column by the parent. */
  skeletonCount?: number;
  members?: { id: string; name: string }[];
  currentUserId?: string | null;
  currentUserCanBeAssignee?: boolean;
  canAssign?: boolean;
  onAssign?: (story: Story, assigneeId: string | null) => void;
  /** Rendered at the bottom of the column body (e.g. the inline "create" row). */
  footer?: ReactNode;
  /** Kanban WIP limit. When set, the header shows `count/limit` and the column
   *  flags red once the count exceeds it. Omit (sprint board) → no WIP UI. */
  wipLimit?: number | null;
}

// Ghost cards shown while the sprint's stories load. Mirrors BoardCard's
// layout (title block + meta row) so the swap-in doesn't shift the column.
// Opacity-only `animate-pulse` — same rule as the Backlog skeletons: no
// transforms, so nothing re-composites under a drag.
export function BoardCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          // Same surface treatment as BoardCard so the swap-in doesn't pop.
          className="rounded-xl border bg-card px-3 pb-2.5 pt-2.5 shadow-card dark:border-white/[0.08] dark:bg-secondary/50"
        >
          <span
            className="block h-3.5 animate-pulse rounded bg-muted"
            style={{ width: `${88 - i * 16}%` }}
          />
          <span className="mt-1.5 block h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          <div className="mt-3 flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 animate-pulse rounded-sm bg-muted" />
            <span className="h-3 w-12 animate-pulse rounded bg-muted" />
            <span className="ml-auto h-5 w-5 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BoardColumn({
  statusRowId,
  coreStatus,
  label,
  color,
  fixedWidth,
  highlighted,
  stories,
  onOpenStory,
  dropDisabled,
  loading,
  skeletonCount = 3,
  members,
  currentUserId,
  currentUserCanBeAssignee,
  canAssign,
  onAssign,
  footer,
  wipLimit,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${statusRowId}`,
    data: { type: 'column', statusRowId, coreStatus },
    disabled: dropDisabled,
  });

  // Either the column's own droppable is over (empty column) or the board says
  // the pointer is over one of this column's cards.
  const showDropTarget = isOver || !!highlighted;

  const totalPoints = stories.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
  const hasWip = wipLimit != null && wipLimit > 0;
  const overLimit = hasWip && !loading && stories.length > wipLimit;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // bg-muted/60 (not /40): at 40% the column surface nearly vanished into
        // the page background in both themes — the board read as floating cards.
        'flex min-h-[240px] flex-col overflow-hidden rounded-lg border border-border/80 bg-muted/60 transition-colors',
        // Fixed width → readable column in the scrolling layout; otherwise the
        // columns share the row equally and may shrink to fit the window.
        columnWidthClass(fixedWidth),
        showDropTarget && 'border-primary bg-primary/5',
        // Over the WIP limit: a quiet red ring so the column reads "too full" at
        // a glance, without shouting over the drag-hover state.
        overLimit && !showDropTarget && 'ring-1 ring-destructive/40',
      )}
      data-column-status={coreStatus}
      data-column-row-id={statusRowId}
      aria-label={`${label} column`}
    >
      {/* Workflow accent stripe — the strongest color cue, full opacity. */}
      {color ? (
        <span aria-hidden className="h-[3px] w-full shrink-0" style={{ backgroundColor: color }} />
      ) : null}
      <header
        className="mb-3 flex items-center justify-between px-3 pb-2 pt-3"
        // 12%/20% alpha — the old 4%/12% tints were indistinguishable from
        // "no tint" on most monitors.
        style={color ? { borderBottom: `2px solid ${color}33`, background: `${color}1f` } : undefined}
      >
        <h3
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest"
          style={color ? { color } : undefined}
        >
          {color ? (
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          ) : null}
          {label}
        </h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {loading ? (
            <span className="h-5 w-5 animate-pulse rounded-full bg-muted" aria-hidden />
          ) : (
            <span
              className={cn(
                'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-semibold',
                overLimit
                  ? 'bg-destructive/15 text-destructive ring-1 ring-destructive/30'
                  : 'bg-muted',
              )}
              title={hasWip ? `${stories.length} of ${wipLimit} (WIP limit)` : undefined}
            >
              {stories.length}{hasWip ? `/${wipLimit}` : ''}
            </span>
          )}
          {!loading && totalPoints > 0 ? (
            <span className="rounded-full bg-background px-1.5 font-mono text-[10px] font-bold">
              {totalPoints}pt
            </span>
          ) : null}
        </span>
      </header>

      {/* `flex-1` claims the column height left after the header; `min-h-0`
          lets this flex child shrink below its content so the overflow
          actually scrolls here instead of stretching the column. */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3 pr-2">
        {loading ? (
          <BoardCardSkeletons count={skeletonCount} />
        ) : (
          <>
            {stories.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-xs text-muted-foreground">
                Drop here
              </div>
            ) : (
              <SortableContext
                items={stories.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {stories.map((s) => (
                    <SortableBoardCard
                      key={s.id}
                      story={s}
                      statusRowId={statusRowId}
                      coreStatus={coreStatus}
                      onOpen={onOpenStory}
                      disabled={dropDisabled}
                      members={members}
                      currentUserId={currentUserId}
                      currentUserCanBeAssignee={currentUserCanBeAssignee}
                      canAssign={canAssign}
                      onAssign={onAssign}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
            {footer ? <div className="mt-2">{footer}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
