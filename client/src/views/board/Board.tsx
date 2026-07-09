// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  changeStoryStatusRowThunk,
  fetchStoriesThunk,
  optimisticReorder,
  optimisticStatusRowChange,
  reorderStoryThunk,
  updateStoryThunk,
} from '@/store/storySlice';
import { useAuth } from '@/hooks/useAuth';
import { fetchSprintsThunk } from '@/store/sprintSlice';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchLabelsThunk } from '@/store/labelSlice';
import { fetchWorkflowThunk } from '@/store/workflowSlice';
import {
  fetchMembersThunk,
  fetchProjectsThunk,
  setCurrentProject,
} from '@/store/projectSlice';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { BoardCard } from '@/components/scrum/BoardCard';
import { BoardCardSkeletons, BoardColumn } from '@/components/scrum/BoardColumn';
import { InlineCreateStoryRow } from '@/components/scrum/InlineCreateStoryRow';
import { BoardFilters } from '@/components/scrum/BoardFilters';
import { CompleteSprintDialog } from '@/components/scrum/CompleteSprintDialog';
import { StartSprintDialog } from '@/components/scrum/StartSprintDialog';
import { SprintNotStartedNotice } from '@/components/scrum/SprintNotStartedNotice';
import { SprintOverdueNotice } from '@/components/scrum/SprintOverdueNotice';
import { type Story, type StoryStatus, type WorkflowStatus, type Priority, type StoryType } from '@/types/scrum';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useSubtaskCompletionGuard } from '@/hooks/useSubtaskCompletionGuard';
import { useStoryListShortcuts } from '@/hooks/useStoryListShortcuts';
import { collectCustomFieldFilters } from '@/utils/customFieldFilters';
import { cn } from '@/lib/utils';
import { boardScrolls, boardRowClass } from '@/components/scrum/boardLayout';
import { CalendarRange } from 'lucide-react';
import { toast } from 'sonner';

/** Match the date style used on the Sprints list + SprintDetail. */
function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

/** Column (workflow-row id) → the stories in it, in display order. */
type ColumnGroups = Record<string, Story[]>;

/** Shallow-clone the grouping so a drag can mutate a working copy without
 *  touching the memoized redux-derived map. */
function cloneGroups(g: ColumnGroups): ColumnGroups {
  const out: ColumnGroups = {};
  for (const k of Object.keys(g)) out[k] = [...g[k]];
  return out;
}

/** Which column currently holds `id` in this grouping. */
function columnOf(g: ColumnGroups, id: string): string | undefined {
  return Object.keys(g).find((col) => g[col].some((s) => s.id === id));
}

export function Board() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const projects = useAppSelector((s) => s.projects.list);
  const sprints = useAppSelector((s) => (id ? s.sprints.byProject[id] ?? [] : []));
  const sprintsLoading = useAppSelector((s) => s.sprints.loading);
  const stories = useAppSelector((s) => s.stories.list);
  const storiesLoading = useAppSelector((s) => s.stories.loading);
  const workflow = useAppSelector((s) => (id ? s.workflow.byProject[id] ?? [] : []));
  const workflowLoading = useAppSelector((s) => s.workflow.loading);
  const project = projects.find((p) => p.id === id) ?? null;
  const members = useAppSelector((s) => s.projects.currentMembers);
  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, name: m.user.name })),
    [members],
  );
  const { user } = useAuth();
  const { canInProject } = useCurrentProject();
  const { requestComplete, guardDialog } = useSubtaskCompletionGuard();
  const canAssign = canInProject('story:assign');
  // Mirrors Backlog.tsx — admins keep `canAssign` globally but can only
  // assign to themselves when they're a member of THIS project.
  const isCurrentUserMember = !!user?.id && memberOptions.some((m) => m.id === user.id);

  // Board sprint resolution: prefer the active sprint; otherwise fall back to
  // the latest planned sprint (by createdAt desc) so users can preview and
  // start it from the board when nothing is active yet.
  const boardSprint = useMemo(() => {
    const active = sprints.find((s) => s.status === 'active') ?? null;
    if (active) return active;
    const planned = sprints
      .filter((s) => s.status === 'planned')
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return planned[0] ?? null;
  }, [sprints]);
  const isPlanned = boardSprint?.status === 'planned';
  // Active sprint that has run past its end date without being completed. Drives
  // the soft "overdue" notice — a nudge, not a block.
  const isOverdue =
    boardSprint?.status === 'active' &&
    !!boardSprint.endDate &&
    new Date(boardSprint.endDate).getTime() < Date.now();
  const [completing, setCompleting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  // Column currently under the drag — drives the "drop here" highlight. Derived
  // from the over target's statusRowId (carried by BOTH cards and columns), so
  // the highlight fires whether closestCorners resolves to a card or the column.
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  // Live column arrangement DURING a drag. Non-null only while dragging: the
  // dragged card is moved into the hovered column here so that column reflows and
  // opens a gap (dnd-kit only reflows items inside the list that holds the active
  // card). Idle → null → columns render straight from the redux-derived grouping.
  const [dragGroups, setDragGroups] = useState<ColumnGroups | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fetch supporting data once per project.
  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchSprintsThunk(id));
    void dispatch(fetchEpicsThunk(id));
    void dispatch(fetchLabelsThunk(id));
    void dispatch(fetchMembersThunk(id));
    void dispatch(fetchWorkflowThunk(id));
  }, [dispatch, id, projects.length]);

  // Fetch stories for the active sprint + current filters.
  const epicFilter = params.get('epic') ?? '';
  const labelFilter = params.get('label') ?? '';
  const priorityFilter = (params.get('priority') as Priority | null) ?? '';
  const typeFilter = (params.get('type') as StoryType | null) ?? '';
  const assigneeFilter = params.get('assignee') ?? '';
  const search = params.get('q') ?? '';
  const customFieldFilter = collectCustomFieldFilters(params);

  const boardFilters = useMemo(
    () =>
      id && boardSprint
        ? {
            projectId: id,
            sprintId: boardSprint.id,
            epicId: epicFilter || undefined,
            labelId: labelFilter || undefined,
            priority: (priorityFilter as Priority) || undefined,
            type: (typeFilter as StoryType) || undefined,
            assigneeId: assigneeFilter || undefined,
            search: search || undefined,
            // Subtasks are off the board by default, but a text search should
            // still surface them (as cards in their status column).
            includeSubtasks: search ? ('true' as const) : undefined,
            customFields: customFieldFilter,
          }
        : null,
    [id, boardSprint, epicFilter, labelFilter, priorityFilter, typeFilter, assigneeFilter, search, customFieldFilter],
  );

  useEffect(() => {
    if (!boardFilters) return;
    void dispatch(fetchStoriesThunk(boardFilters));
  }, [dispatch, boardFilters]);

  const onAssignFromCard = async (story: Story, assigneeId: string | null) => {
    if ((story.assignee?.id ?? null) === assigneeId) return;
    const r = await dispatch(updateStoryThunk({ id: story.id, input: { assigneeId } }));
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(
        assigneeId
          ? `${story.key} assigned to ${memberOptions.find((m) => m.id === assigneeId)?.name ?? 'member'}`
          : `${story.key} unassigned`,
      );
    } else {
      toast.error((r.payload as string) ?? 'Could not change assignee');
    }
    // NO board refetch here — that's what caused the jitter. `updateStoryThunk`
    // already returns the updated story and `updateStoryThunk.fulfilled`
    // surgically swaps just that one entry in `state.list`, so only its card
    // re-renders. A `fetchStoriesThunk` here would replace the WHOLE list
    // (every card gets a new ref) AND flip `storiesLoading`, flashing the
    // column skeletons — a visible "refresh". The backlog stays smooth for
    // exactly this reason: it never refetches after an inline assign.
  };

  // `f` toggles the filter panel. `/` is handled by BoardFilters itself
  // (it owns the search input ref). No selection model on Board, so the
  // selection-related bindings stay no-ops here.
  useStoryListShortcuts({
    toggleFilters: () => setFiltersOpen((v) => !v),
    hasSelection: false,
    clearSelection: () => {},
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragStart = (e: DragStartEvent) => {
    const story = e.active.data.current?.story as Story | undefined;
    setActiveStory(story ?? null);
  };

  // Runs continuously as the pointer moves. Two jobs: (1) light up the hovered
  // column, (2) when hovering a DIFFERENT column, live-move the dragged card into
  // it so that column opens a gap. Same-column hovers return the previous state
  // unchanged, so dnd-kit's own in-list displacement handles the reflow and we
  // avoid needless re-renders.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    const overData = over?.data.current as
      | { type?: 'card' | 'column'; statusRowId?: string }
      | undefined;
    setOverColumnId(overData?.statusRowId ?? null);
    const toCol = overData?.statusRowId;
    if (!over || !toCol) return;
    const activeId = String(active.id);

    setDragGroups((prev) => {
      const base = prev ?? cloneGroups(groupedByRow);
      const fromCol = columnOf(base, activeId);
      if (!fromCol || fromCol === toCol) return prev; // same column → no churn
      const moved = base[fromCol].find((s) => s.id === activeId);
      if (!moved) return prev;

      const next = cloneGroups(base);
      next[fromCol] = next[fromCol].filter((s) => s.id !== activeId);
      const toItems = next[toCol] ? [...next[toCol]] : [];
      // Insert where the pointer is: before the card it's over, else at the end
      // (e.g. hovering the empty part of the column).
      let insertAt = toItems.length;
      if (overData?.type === 'card') {
        const idx = toItems.findIndex((s) => s.id === String(over.id));
        if (idx >= 0) insertAt = idx;
      }
      toItems.splice(insertAt, 0, moved);
      next[toCol] = toItems;
      return next;
    });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    // Snapshot the live drag state, then reset so the UI leaves drag mode.
    const groups = dragGroups;
    const dragged = activeStory;
    setActiveStory(null);
    setOverColumnId(null);
    setDragGroups(null);

    const { over } = event;
    if (!over || !dragged) return;
    const activeId = dragged.id;

    // Origin = where the card sat before the drag (redux grouping, untouched
    // during drag). Final = where the live drag arrangement left it.
    const originCol = columnOf(groupedByRow, activeId);
    const finalCol = groups ? columnOf(groups, activeId) : originCol;
    if (!originCol || !finalCol) return;

    if (!canInProject('story:status')) {
      if (finalCol !== originCol) toast.error("You don't have permission to move stories");
      return;
    }

    // ── Reorder within the same column ──
    // dnd-kit displaced the neighbours visually; dragGroups is left untouched for
    // same-column hovers, so resolve the new order from the card released over.
    if (finalCol === originCol) {
      const overId = String(over.id);
      if (overId === activeId) return;
      const ids = (groupedByRow[originCol] ?? []).map((s) => s.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const ordered = arrayMove(ids, oldIndex, newIndex);
      const pos = ordered.indexOf(activeId);
      const prevId = pos > 0 ? ordered[pos - 1] : null;
      const nextId = pos < ordered.length - 1 ? ordered[pos + 1] : null;
      dispatch(optimisticReorder({ id: activeId, prevId }));
      const r = await dispatch(reorderStoryThunk({ id: activeId, prevId, nextId }));
      if (r.meta.requestStatus !== 'fulfilled') {
        if (boardFilters) void dispatch(fetchStoriesThunk(boardFilters)); // restore server order
        toast.error((r.payload as string) ?? 'Could not reorder — reverted');
      }
      return;
    }

    // ── Move to a different column, landing where it was dropped ──
    // Planned sprints are intentionally NOT blocked: moving cards before a sprint
    // starts is allowed and the "not started" banner sets that expectation.
    //
    // onDragOver spliced the card into finalCol at its ENTRY index; while moving
    // within that column dnd-kit only displaces visually (dragGroups isn't
    // re-touched), so the entry index is stale. Resolve the true slot the same
    // way the same-column path does — from the card released over, via arrayMove.
    const items = (groups?.[finalCol] ?? []).map((s) => s.id);
    const overId = String(over.id);
    const oldIndex = items.indexOf(activeId);
    let newIndex = items.indexOf(overId);
    if (newIndex < 0) newIndex = items.length - 1; // released over the column, not a card
    const ordered =
      oldIndex >= 0 && newIndex >= 0 ? arrayMove(items, oldIndex, newIndex) : items;
    const pos = ordered.indexOf(activeId);
    const prevId = pos > 0 ? ordered[pos - 1] : null;
    const nextId = pos >= 0 && pos < ordered.length - 1 ? ordered[pos + 1] : null;
    const coreStatus = workflow.find((w) => w.id === finalCol)?.coreStatus ?? dragged.status;

    // Optimistic: set the new column, then slot the card between its new
    // neighbours (grouping follows array position, so this holds the drop spot).
    dispatch(optimisticStatusRowChange({ id: activeId, statusId: finalCol, coreStatus }));
    dispatch(optimisticReorder({ id: activeId, prevId }));

    // Persist column, then rank. Two calls (no atomic endpoint): display order
    // tracks array position — not the returned rank — so the resolved values
    // don't cause a visible jump. A full refetch happens only on failure.
    const persist = async (cascadeSubtasks: boolean) => {
      const moved = await dispatch(
        changeStoryStatusRowThunk({ id: activeId, statusRowId: finalCol, cascadeSubtasks }),
      );
      if (moved.meta.requestStatus !== 'fulfilled') {
        if (boardFilters) void dispatch(fetchStoriesThunk(boardFilters));
        toast.error((moved.payload as string) ?? 'Could not move card — reverted');
        return;
      }
      const ranked = await dispatch(reorderStoryThunk({ id: activeId, prevId, nextId }));
      if (ranked.meta.requestStatus !== 'fulfilled') {
        if (boardFilters) void dispatch(fetchStoriesThunk(boardFilters));
        toast.error((ranked.payload as string) ?? 'Moved, but could not set position');
      }
    };

    // Soft-warn before completing a parent that still has open subtasks. The
    // card already moved optimistically; cancelling refetches to restore it.
    await requestComplete({
      storyId: activeId,
      storyKey: dragged.key,
      storyTitle: dragged.title,
      targetIsDone: coreStatus === 'done',
      subtaskCount: dragged._count?.subtasks,
      onProceed: persist,
      onCancel: () => {
        if (boardFilters) void dispatch(fetchStoriesThunk(boardFilters));
      },
    });
  };

  const openStory = (s: Story) => {
    const p = new URLSearchParams(params);
    p.set('story', s.key);
    setParams(p);
  };

  /**
   * Group stories by their workflow column (statusId). Stories with a null
   * statusId fall back to the FIRST workflow row matching their coreStatus
   * enum — keeps legacy rows rendering on the board while 9A.2 propagates.
   */
  const groupedByRow = useMemo(() => {
    const map: Record<string, Story[]> = {};
    const firstRowForStatus = (status: StoryStatus): WorkflowStatus | undefined =>
      workflow.find((w) => w.coreStatus === status);
    for (const s of stories) {
      // Place each story on its actual column (statusId), falling back to the
      // first column for its core status if the id is missing/stale.
      const rowId = s.statusId ?? firstRowForStatus(s.status)?.id;
      if (!rowId) continue;
      (map[rowId] ||= []).push(s);
    }
    return map;
  }, [stories, workflow]);

  // While dragging across columns, render from the live arrangement so the
  // target column opens a gap; idle → straight from the redux-derived grouping.
  const displayGroups = dragGroups ?? groupedByRow;

  // Columns shown on the board. Past MAX_FIT_COLUMNS we stop stretching and
  // scroll horizontally instead.
  const boardColumns = workflow;
  const manyColumns = boardScrolls(boardColumns.length);

  if (!id) return null;

  if (!project) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Sprints not fetched yet — show the board's shape, not a premature
  // "no sprint" empty state that flashes and gets replaced.
  if (!boardSprint && sprintsLoading) {
    return (
      <div className="flex h-full flex-col" aria-label="Sprint board loading" aria-busy>
        <div className="px-6 pt-6">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <div className="mt-3 h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3.5 w-96 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
          <BoardColumnsSkeleton />
        </div>
      </div>
    );
  }

  if (!boardSprint) {
    return (
      <div className="space-y-4">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold">{project.name} — Board</h1>
        </div>
        <EmptyState
          title="No active or planned sprint"
          description="Create a sprint from the Sprints page to bring stories onto the board."
          action={
            <Button asChild>
              <Link to={`/projects/${id}/sprints`}>Go to Sprints</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const totalPts = stories.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
  const donePts = stories.filter((s) => s.status === 'done').reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
  const pct = totalPts === 0 ? 0 : Math.round((donePts / totalPts) * 100);

  return (
    <div className="flex h-full flex-col" aria-label="Sprint board">
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold">
            {boardSprint.name}
            <Badge variant={isPlanned ? 'outline' : 'secondary'} className="ml-2 align-middle">
              {isPlanned ? 'planned' : 'active'}
            </Badge>
          </h1>
          {boardSprint.startDate || boardSprint.endDate ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {fmtDate(boardSprint.startDate)} → {fmtDate(boardSprint.endDate)}
            </p>
          ) : null}
          {boardSprint.goal ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{boardSprint.goal}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right text-xs">
            <div className="text-muted-foreground">Progress</div>
            <div className="font-mono text-sm">
              {donePts}/{totalPts} pts · {pct}%
            </div>
          </div>
          {isPlanned ? (
            canInProject('sprint:start') ? (
              <Button onClick={() => setStarting(true)}>Start sprint</Button>
            ) : null
          ) : canInProject('sprint:complete') ? (
            <Button onClick={() => setCompleting(true)}>Complete sprint</Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <BoardFilters
          projectId={id}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((v) => !v)}
        />
      </div>

      {isPlanned ? (
        <div className="mt-3 px-6">
          <SprintNotStartedNotice canStart={canInProject('sprint:start')} />
        </div>
      ) : isOverdue ? (
        <div className="mt-3 px-6">
          <SprintOverdueNotice
            canComplete={canInProject('sprint:complete')}
            endDate={boardSprint.endDate}
          />
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveStory(null);
          setOverColumnId(null);
          setDragGroups(null);
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
          {/* `flex-1 min-h-0` makes the columns row fill the board area's
              height; default `items-stretch` then gives every column that
              same height — uniform regardless of ticket count. */}
          <div
            className={cn(
              'flex min-h-0 flex-1 gap-3',
              // Few columns: stretch to fill the window. Many columns: fixed
              // width + horizontal scroll so cards stay readable.
              boardRowClass(manyColumns),
            )}
          >
            {/* One column per workflow row (skip `backlog` — that's its own view).
                Each row gets its own droppable id so users can drag to custom
                columns distinctly even when two share a coreStatus. While the
                workflow itself is loading there are no rows yet, so ghost
                columns hold the layout. */}
            {boardColumns.length === 0 && workflowLoading ? (
              <BoardColumnsSkeleton />
            ) : (
              boardColumns.map((row, i) => (
                <BoardColumn
                  key={row.id}
                  statusRowId={row.id}
                  coreStatus={row.coreStatus}
                  label={row.label}
                  color={row.color}
                  fixedWidth={manyColumns}
                  highlighted={overColumnId === row.id}
                  stories={displayGroups[row.id] ?? []}
                  onOpenStory={openStory}
                  dropDisabled={!canInProject('story:status')}
                  loading={storiesLoading}
                  // Vary ghost-card counts so the loading board reads like a
                  // board, not a grid of identical placeholders.
                  skeletonCount={3 - (i % 3)}
                  members={memberOptions}
                  currentUserId={user?.id ?? null}
                  currentUserCanBeAssignee={isCurrentUserMember}
                  canAssign={canAssign}
                  onAssign={onAssignFromCard}
                  footer={
                    row.coreStatus === 'todo' && canInProject('story:create') ? (
                      <InlineCreateStoryRow
                        projectId={id}
                        members={memberOptions}
                        sprintId={boardSprint.id}
                        status="todo"
                      />
                    ) : null
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* DragOverlay renders at the document root — escapes overflow/scroll
            clipping and positions by real cursor coords, not element transform.
            A short eased dropAnimation settles the card into its landing slot
            instead of popping — matches the reflow easing of the neighbours. */}
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {activeStory ? (
            <BoardCard story={activeStory} onOpen={() => {}} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CompleteSprintDialog
        sprint={completing && !isPlanned ? boardSprint : null}
        onOpenChange={(open) => !open && setCompleting(false)}
      />
      <StartSprintDialog
        sprint={starting && isPlanned ? boardSprint : null}
        onOpenChange={(open) => !open && setStarting(false)}
        onStarted={() => {
          if (id) void dispatch(fetchSprintsThunk(id));
        }}
      />
      {guardDialog}
    </div>
  );
}

// Ghost columns shown before the workflow rows (or the sprint itself) have
// loaded. Mirrors BoardColumn's shell so the real columns land without shift.
function BoardColumnsSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex min-h-0 flex-1 gap-3" aria-hidden>
      {Array.from({ length: columns }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[240px] min-w-0 flex-1 basis-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-muted/60"
        >
          {/* Stand-in for the workflow accent stripe. */}
          <span className="h-[3px] w-full shrink-0 animate-pulse bg-muted" />
          <div className="mb-3 flex items-center justify-between px-3 pb-2 pt-3">
            <span
              className="h-3 animate-pulse rounded bg-muted"
              style={{ width: `${64 + (i % 2) * 24}px` }}
            />
            <span className="h-5 w-5 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3 pr-2">
            <BoardCardSkeletons count={3 - (i % 3)} />
          </div>
        </div>
      ))}
    </div>
  );
}
