// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { CSSProperties, ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from 'react-router-dom';
import { Link2, ListTree } from 'lucide-react';
import type { Story, StoryStatus } from '@/types/scrum';
import { Avatar } from '@/components/ui/avatar';
import { StoryTypeIcon } from './StoryTypeIcon';
import { PriorityBadge } from './PriorityBadge';
import { LabelBadges } from './LabelBadges';
import { EpicChip } from './EpicChip';
import { UserPicker } from './UserPicker';
import { cn } from '@/lib/utils';
import { userLabel } from '@/lib/userLabel';

interface BoardCardProps {
  story: Story;
  onOpen: (story: Story) => void;
  disabled?: boolean;
  /** True when rendered inside DragOverlay — no draggable binding, just visuals. */
  isOverlay?: boolean;
  /** Project members, used to render the inline assignee picker. */
  members?: { id: string; name: string }[];
  /** Logged-in user's id, for the "Me" shortcut. */
  currentUserId?: string | null;
  /** True when the logged-in user is a member of this project (= eligible
   *  to be assigned). Gates the "Me" shortcut. Server enforces the rule. */
  currentUserCanBeAssignee?: boolean;
  /** Whether the logged-in user can perform the assign action at all. */
  canAssign?: boolean;
  /** Reassign callback. `null` = unassign. */
  onAssign?: (story: Story, assigneeId: string | null) => void;
}

/**
 * Shared card chrome (the root button-div + click/keyboard handlers + styling).
 * Both the plain DRAGGABLE card (epic board) and the SORTABLE card (sprint board)
 * render through this so they stay pixel-identical — only the dnd bindings differ.
 */
function CardShell({
  story,
  onOpen,
  disabled,
  isOverlay,
  isDragging,
  setRef,
  bindings,
  style,
  children,
}: {
  story: Story;
  onOpen: (story: Story) => void;
  disabled?: boolean;
  isOverlay: boolean;
  isDragging: boolean;
  setRef?: (el: HTMLElement | null) => void;
  bindings?: Record<string, unknown>;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      ref={isOverlay ? undefined : setRef}
      {...(isOverlay ? {} : bindings)}
      style={isOverlay ? undefined : style}
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      aria-label={`Open story ${story.key}: ${story.title}`}
      onClick={(e) => {
        if (isOverlay || isDragging) return;
        // Ignore clicks bubbling from the inline assignee picker — the
        // trigger is a <button> that lives inside this card.
        const t = e.target as HTMLElement | null;
        if (t && t.closest('button, input, [role="menu"], [role="menuitem"]')) return;
        // Ctrl/Cmd-click opens the story's full page in a new browser tab;
        // a plain click opens the side panel as before.
        if (e.metaKey || e.ctrlKey) {
          window.open(`/projects/${story.projectId}/stories/${story.key}`, '_blank', 'noopener');
          return;
        }
        onOpen(story);
      }}
      onKeyDown={(e) => {
        if (!isOverlay && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(story);
        }
      }}
      className={cn(
        // Dark mode lifts the card above the column surface: --card (14%) on the
        // column (~15%) was a ~1% lightness difference — effectively invisible.
        // secondary/50 composites to ~18% and the white/8% border draws the edge.
        'group relative overflow-hidden rounded-xl border bg-card shadow-card dark:border-white/[0.08] dark:bg-secondary/50',
        isOverlay
          ? 'cursor-grabbing shadow-float rotate-1 scale-105'
          : isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab transition-all duration-150 hover:shadow-elevated hover:-translate-y-0.5',
        disabled && !isOverlay && 'cursor-not-allowed opacity-60',
      )}
      data-story-key={story.key}
      data-story-status={story.status}
    >
      {children}
    </div>
  );
}

/** Inner content (epic stripe, title, meta footer, assignee picker). Pure visual. */
function BoardCardInner({
  story,
  isOverlay,
  isDragging,
  members = [],
  currentUserId = null,
  currentUserCanBeAssignee = false,
  canAssign = false,
  onAssign,
}: BoardCardProps & { isOverlay: boolean; isDragging: boolean }) {
  const hasLabels = (story.labels?.length ?? 0) > 0;
  return (
    <>
      {story.epic ? (
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-1 rounded-r-sm"
          style={{ backgroundColor: story.epic.color }}
        />
      ) : null}

      <div className="pl-2.5 pr-3 pt-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{story.title}</p>
        {/* Labels are READ-ONLY on the board — shown when the story has any.
            To add or edit labels, open the story detail panel. */}
        {hasLabels ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <LabelBadges labels={story.labels} max={3} />
          </div>
        ) : null}
      </div>

      <div className="flex w-full items-center gap-1.5 px-3 pb-2.5 pt-1.5 text-[11px] text-muted-foreground">
        <StoryTypeIcon type={story.type} className="shrink-0" />
        {/* The key is a real link to the full-page ticket: right-click → "Open
            in new tab", underlines on hover. stopPropagation keeps a click off
            the card's open-drawer handler and a press off the drag sensor. */}
        <Link
          to={`/projects/${story.projectId}/stories/${story.key}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 font-mono text-[10px] hover:text-foreground hover:underline"
          title={`Open ${story.key} (right-click to open in a new tab)`}
        >
          {story.key}
        </Link>
        {(story._count?.subtasks ?? 0) > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5" title={`${story._count?.subtasks} subtasks`}>
            <ListTree className="h-3 w-3" />
            {story._count?.subtasks}
          </span>
        ) : null}
        {(story._count?.outgoingLinks ?? 0) > 0 ? (
          <span className="flex shrink-0 items-center gap-0.5" title={`${story._count?.outgoingLinks} linked`}>
            <Link2 className="h-3 w-3" />
            {story._count?.outgoingLinks}
          </span>
        ) : null}
        {/* The epic chip is the ONLY flexible element in this row: it takes the
            slack and TRUNCATES when the card is narrow, so a long epic name can
            never push the priority/points/assignee group past the card's
            overflow-hidden edge (which is what used to clip the avatar on small
            screens). `ml-auto` right-aligns the chip + everything after it. */}
        {story.epic ? (
          <EpicChip epic={story.epic} className="ml-auto min-w-0 shrink max-w-[96px]" />
        ) : null}
        {/* Fixed trailing group — always fully visible. Takes `ml-auto` itself
            only when there's no epic chip to carry it to the right edge. */}
        <span className={cn('flex shrink-0 items-center gap-1.5', !story.epic && 'ml-auto')}>
          <PriorityBadge priority={story.priority} />
          {typeof story.storyPoints === 'number' ? (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-bold text-foreground">
              {story.storyPoints}
            </span>
          ) : null}
          {canAssign && onAssign && !isOverlay && !isDragging ? (
            <UserPicker
              value={story.assignee?.id ?? null}
              onChange={(id) => onAssign(story, id)}
              allowUnassign
              align="end"
              options={members.map((m) => ({ id: m.id, name: m.name }))}
              currentUserId={currentUserCanBeAssignee ? currentUserId : null}
              trigger={
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="rounded-full ring-offset-1 hover:ring-2 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label={
                    story.assignee
                      ? `Change assignee for ${story.key} (currently ${userLabel(story.assignee)})`
                      : `Assign ${story.key}`
                  }
                  title={userLabel(story.assignee, 'Unassigned — click to assign')}
                >
                  <Avatar name={story.assignee?.name ?? null} />
                </button>
              }
            />
          ) : (
            <Avatar name={story.assignee?.name ?? null} />
          )}
        </span>
      </div>
    </>
  );
}

/**
 * Plain DRAGGABLE card — used by the epic board (and the DragOverlay). Unchanged
 * behaviour; the epic board's DnD relies on this `useDraggable` binding.
 */
export function BoardCard(props: BoardCardProps) {
  const { story, disabled, isOverlay = false } = props;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: story.id,
    data: { story },
    disabled: disabled || isOverlay,
  });

  return (
    <CardShell
      story={story}
      onOpen={props.onOpen}
      disabled={disabled}
      isOverlay={isOverlay}
      isDragging={isDragging}
      setRef={setNodeRef}
      bindings={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0 : 1 }}
    >
      <BoardCardInner {...props} isOverlay={isOverlay} isDragging={isDragging} />
    </CardShell>
  );
}

/**
 * Reflow easing for the cards that shuffle aside to open a gap while another
 * card is dragged over them. dnd-kit's default is `transform 250ms ease`, whose
 * slow-in/slow-out curve makes neighbours linger then snap — reads as "sticky".
 * easeOutQuint (fast start, gentle settle) makes the spread feel fluid instead.
 */
const REFLOW_TRANSITION = { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

/**
 * SORTABLE card — used by the sprint board so cards can be reordered within a
 * column (Jira-style rank). Carries `statusRowId`/`coreStatus` in its sortable
 * data so the drop handler can resolve the target column. Must be rendered
 * inside a `SortableContext`.
 */
export function SortableBoardCard(
  props: BoardCardProps & { statusRowId: string; coreStatus: StoryStatus },
) {
  const { story, disabled, statusRowId, coreStatus } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: story.id,
    data: { type: 'card', story, statusRowId, coreStatus },
    disabled,
    transition: REFLOW_TRANSITION,
  });

  return (
    <CardShell
      story={story}
      onOpen={props.onOpen}
      disabled={disabled}
      isOverlay={false}
      isDragging={isDragging}
      setRef={setNodeRef}
      bindings={{ ...attributes, ...listeners }}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1 }}
    >
      <BoardCardInner {...props} isOverlay={false} isDragging={isDragging} />
    </CardShell>
  );
}
