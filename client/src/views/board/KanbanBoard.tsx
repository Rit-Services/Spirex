// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  changeStoryStatusRowThunk,
  fetchStoriesThunk,
  optimisticReorder,
  optimisticStatusRowChange,
  reorderStoryThunk,
  replaceStoryInList,
  updateStoryThunk,
} from '@/store/storySlice';
import { useAuth } from '@/hooks/useAuth';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchLabelsThunk } from '@/store/labelSlice';
import { fetchWorkflowThunk } from '@/store/workflowSlice';
import {
  fetchMembersThunk,
  fetchProjectsThunk,
  setCurrentProject,
} from '@/store/projectSlice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BoardCard } from '@/components/scrum/BoardCard';
import { BoardColumn } from '@/components/scrum/BoardColumn';
import { InlineCreateStoryRow } from '@/components/scrum/InlineCreateStoryRow';
import { BoardFilters } from '@/components/scrum/BoardFilters';
import { type Story, type StoryStatus, type WorkflowStatus, type Priority, type StoryType } from '@/types/scrum';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useStoryListShortcuts } from '@/hooks/useStoryListShortcuts';
import { collectCustomFieldFilters } from '@/utils/customFieldFilters';
import { cn } from '@/lib/utils';
import { boardScrolls, boardRowClass } from '@/components/scrum/boardLayout';
import { toast } from 'sonner';

/**
 * SPIREX Kanban board — SKELETON.
 *
 * Unlike the sprint Board, this is a CONTINUOUS-FLOW view: it shows every story
 * in the project across its workflow columns, with no sprint boundary, no
 * start/complete ceremony. It deliberately reuses the sprint board's engine —
 * BoardColumn, BoardCard, drag-to-reorder, drag-to-change-status — so the only
 * real difference is the data scope (no sprintId filter) and the chrome.
 *
 * WIP limits are LIVE: each column's `wipLimit` (set in Workflow settings) shows
 * as `count/limit` in the header, flags the column red when exceeded, and warns
 * on a move that would push a column over (soft enforcement — see onDragEnd).
 *
 * Still open to make this a "complete" Kanban board (both additive, isolated):
 *   - Swimlanes              (group rows by assignee / epic)
 *   - Cumulative flow report
 */
export function KanbanBoard() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const projects = useAppSelector((s) => s.projects.list);
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
  const canAssign = canInProject('story:assign');
  const isCurrentUserMember = !!user?.id && memberOptions.some((m) => m.id === user.id);

  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Supporting data — same as the sprint board, minus sprints (none needed here).
  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchEpicsThunk(id));
    void dispatch(fetchLabelsThunk(id));
    void dispatch(fetchMembersThunk(id));
    void dispatch(fetchWorkflowThunk(id));
  }, [dispatch, id, projects.length]);

  const epicFilter = params.get('epic') ?? '';
  const labelFilter = params.get('label') ?? '';
  const priorityFilter = (params.get('priority') as Priority | null) ?? '';
  const typeFilter = (params.get('type') as StoryType | null) ?? '';
  const assigneeFilter = params.get('assignee') ?? '';
  const search = params.get('q') ?? '';
  const customFieldFilter = collectCustomFieldFilters(params);

  // The ONE meaningful difference from Board.tsx: `sprintId` is OMITTED. The
  // backend (storyService.listStories) reads that as "every story in the
  // project", which is exactly the continuous-flow scope Kanban wants.
  const boardFilters = useMemo(
    () =>
      id
        ? {
            projectId: id,
            epicId: epicFilter || undefined,
            labelId: labelFilter || undefined,
            priority: (priorityFilter as Priority) || undefined,
            type: (typeFilter as StoryType) || undefined,
            assigneeId: assigneeFilter || undefined,
            search: search || undefined,
            customFields: customFieldFilter,
          }
        : null,
    [id, epicFilter, labelFilter, priorityFilter, typeFilter, assigneeFilter, search, customFieldFilter],
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
    // No refetch after assign — see the note in Board.tsx. updateStoryThunk
    // patches the single entry in place, keeping the board jitter-free.
  };

  useStoryListShortcuts({
    toggleFilters: () => setFiltersOpen((v) => !v),
    hasSelection: false,
    clearSelection: () => {},
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const collisionDetection: CollisionDetection = (args) => {
    const over = pointerWithin(args);
    return over.length > 0 ? over : closestCenter(args);
  };

  const onDragStart = (e: DragStartEvent) => {
    const story = e.active.data.current?.story as Story | undefined;
    setActiveStory(story ?? null);
  };

  // Identical drag semantics to the sprint board: same-column drops reorder
  // (rank), cross-column drops change workflow status. No sprint/planned guards
  // because there's no sprint here.
  const onDragEnd = async (event: DragEndEvent) => {
    setActiveStory(null);
    const { active, over } = event;
    if (!over) return;
    const story = active.data.current?.story as Story | undefined;
    const target = over.data.current as
      | { type?: 'card' | 'column'; statusRowId: string; coreStatus: StoryStatus }
      | undefined;
    if (!story || !target) return;

    const sameColumn = story.statusId === target.statusRowId;

    if (sameColumn && target.type === 'card' && over.id !== active.id) {
      if (!canInProject('story:status')) return;
      const ids = (groupedByRow[target.statusRowId] ?? []).map((s) => s.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const ordered = arrayMove(ids, oldIndex, newIndex);
      const pos = ordered.indexOf(String(active.id));
      const prevId = pos > 0 ? ordered[pos - 1] : null;
      const nextId = pos < ordered.length - 1 ? ordered[pos + 1] : null;
      dispatch(optimisticReorder({ id: story.id, prevId }));
      const r = await dispatch(reorderStoryThunk({ id: story.id, prevId, nextId }));
      if (r.meta.requestStatus !== 'fulfilled') {
        if (boardFilters) void dispatch(fetchStoriesThunk(boardFilters));
        toast.error((r.payload as string) ?? 'Could not reorder — reverted');
      }
      return;
    }

    if (sameColumn) return;

    if (!canInProject('story:status')) {
      toast.error("You don't have permission to move stories");
      return;
    }

    // WIP-limit signal. Standard Kanban practice is to make the limit VISIBLE
    // and warn on breach rather than hard-block the drag — the limit is a
    // conversation prompt ("finish something before starting more"), not a lock.
    // `targetCount` is the column's size BEFORE this card lands, so `>= limit`
    // means the move would push it OVER. Flip this to a `return` to hard-enforce.
    const targetCol = boardColumns.find((c) => c.id === target.statusRowId);
    const targetCount = (groupedByRow[target.statusRowId] ?? []).length;
    if (targetCol?.wipLimit != null && targetCount >= targetCol.wipLimit) {
      toast.warning(
        `"${targetCol.label}" is over its WIP limit (${targetCount + 1}/${targetCol.wipLimit}) — finish work in progress before pulling more.`,
      );
    }

    const previous = story;
    dispatch(
      optimisticStatusRowChange({
        id: story.id,
        statusId: target.statusRowId,
        coreStatus: target.coreStatus,
      }),
    );

    const r = await dispatch(
      changeStoryStatusRowThunk({ id: story.id, statusRowId: target.statusRowId }),
    );
    if (r.meta.requestStatus !== 'fulfilled') {
      dispatch(replaceStoryInList(previous));
      toast.error((r.payload as string) ?? 'Could not move card — reverted');
    }
  };

  const openStory = (s: Story) => {
    const p = new URLSearchParams(params);
    p.set('story', s.key);
    setParams(p);
  };

  // Group by workflow column. Simpler than the sprint board: no planned-sprint
  // backlog-preview special case. Backlog-status stories (null statusId, backlog
  // coreStatus) fall to the excluded `backlog` column and drop out — by design,
  // the backlog has its own view.
  const groupedByRow = useMemo(() => {
    const map: Record<string, Story[]> = {};
    const firstRowForStatus = (status: StoryStatus): WorkflowStatus | undefined =>
      workflow.find((w) => w.coreStatus === status);
    for (const s of stories) {
      const rowId = s.statusId ?? firstRowForStatus(s.status)?.id;
      if (!rowId) continue;
      (map[rowId] ||= []).push(s);
    }
    return map;
  }, [stories, workflow]);

  // Same column set as the sprint board.
  const boardColumns = workflow;
  const manyColumns = boardScrolls(boardColumns.length);
  const totalOnBoard = Object.values(groupedByRow).reduce((n, list) => n + list.length, 0);

  if (!id) return null;
  if (!project) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex h-full flex-col" aria-label="Kanban board">
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
            {project.name} — Kanban
            <Badge variant="secondary" className="align-middle">continuous flow</Badge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every story across the project, flowing through your workflow columns — no sprint required.
          </p>
        </div>
        <div className="text-right text-xs">
          <div className="text-muted-foreground">On board</div>
          <div className="font-mono text-sm">{totalOnBoard} stories</div>
        </div>
      </div>

      <div className="mt-4">
        <BoardFilters
          projectId={id}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((v) => !v)}
        />
      </div>

      {/* TODO(kanban): swimlane selector mounts here (group rows by assignee/epic). */}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
          <div className={cn('flex min-h-0 flex-1 gap-3', boardRowClass(manyColumns))}>
            {boardColumns.map((row, i) => (
              <BoardColumn
                key={row.id}
                statusRowId={row.id}
                coreStatus={row.coreStatus}
                label={row.label}
                color={row.color}
                fixedWidth={manyColumns}
                wipLimit={row.wipLimit}
                stories={groupedByRow[row.id] ?? []}
                onOpenStory={openStory}
                dropDisabled={!canInProject('story:status')}
                loading={storiesLoading || workflowLoading}
                skeletonCount={3 - (i % 3)}
                members={memberOptions}
                currentUserId={user?.id ?? null}
                currentUserCanBeAssignee={isCurrentUserMember}
                canAssign={canAssign}
                onAssign={onAssignFromCard}
                footer={
                  row.coreStatus === 'todo' && canInProject('story:create') ? (
                    // Sprintless create: new card lands in this column (To Do),
                    // not in a sprint. sprintId=null keeps it on the flow board.
                    <InlineCreateStoryRow
                      projectId={id}
                      members={memberOptions}
                      sprintId={null}
                      status="todo"
                    />
                  ) : null
                }
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeStory ? <BoardCard story={activeStory} onOpen={() => {}} isOverlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
