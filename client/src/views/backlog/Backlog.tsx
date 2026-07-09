// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  changeStorySprintThunk,
  changeStoryStatusRowThunk,
  deleteStoryThunk,
  fetchStoriesThunk,
  optimisticReorder,
  optimisticStatusRowChange,
  optimisticSprintMove,
  reorderStoryThunk,
  updateStoryThunk,
} from '@/store/storySlice';
import { fetchWorkflowThunk } from '@/store/workflowSlice';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchLabelsThunk } from '@/store/labelSlice';
import { fetchSprintsThunk } from '@/store/sprintSlice';
import { CreateSprintDialog } from '@/components/scrum/CreateSprintDialog';
import { fetchMembersThunk, fetchProjectsThunk, setCurrentProject } from '@/store/projectSlice';
import { storyApi } from '@/apis/storyApi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { CreateStoryDialog } from '@/components/scrum/CreateStoryDialog';
import { InlineCreateStoryRow } from '@/components/scrum/InlineCreateStoryRow';
import { StoryTypeIcon } from '@/components/scrum/StoryTypeIcon';
import { PriorityBadge } from '@/components/scrum/PriorityBadge';
import { LabelBadges } from '@/components/scrum/LabelBadges';
import { LabelEditPopover } from '@/components/scrum/LabelEditPopover';
import { EpicChip } from '@/components/scrum/EpicChip';
import { UserPicker } from '@/components/scrum/UserPicker';
import { StartSprintDialog } from '@/components/scrum/StartSprintDialog';
import { CompleteSprintDialog } from '@/components/scrum/CompleteSprintDialog';
import { SprintNotStartedNotice } from '@/components/scrum/SprintNotStartedNotice';
import { SprintOverdueNotice } from '@/components/scrum/SprintOverdueNotice';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useSubtaskCompletionGuard } from '@/hooks/useSubtaskCompletionGuard';
import {
  Search,
  ChevronDown,
  GripVertical,
  Plus,
  MoreHorizontal,
  Filter as FilterIcon,
  X,
  CalendarDays,
  ExternalLink,
  Copy,
  UserPlus,
  UserX,
  Trash2,
  ArrowDownToLine,
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  ListTree,
  Tags,
} from 'lucide-react';
import { isTextEditableTarget } from '@/utils/keyboard';
import { useCustomFields } from '@/hooks/useCustomFields';
import {
  CF_PARAM_PREFIX,
  clearCustomFieldFilters,
  collectCustomFieldFilters,
  countCustomFieldFilters,
} from '@/utils/customFieldFilters';
import { toast } from 'sonner';
import type { Priority, Sprint, Story, StoryStatus, StoryType, WorkflowStatus } from '@/types/scrum';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { userLabel } from '@/lib/userLabel';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const BACKLOG_DROP_ID = 'zone:backlog';
const sprintDropId = (sprintId: string) => `zone:sprint:${sprintId}`;

// Pointer-first collision detection: the drop target is whatever the CURSOR is
// over, so a story registers in a lane / the backlog the instant the pointer
// enters that section — you no longer have to drag the card body deep inside
// first. (The old `closestCenter` compared section CENTRES, so on a tall lane
// the card had to travel far before the lane's centre beat the source's.) Falls
// back to rect intersection for the keyboard sensor, which has no pointer.
const dndCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};
// Lane id used in sortable data: the sprint id, or this sentinel for the backlog.
const BACKLOG_LANE = 'backlog';

// Jira's status grouping: To do | In progress | Done
type StatusBucket = 'todo' | 'in_progress' | 'done';
function bucketOf(s: StoryStatus): StatusBucket {
  if (s === 'done') return 'done';
  if (s === 'in_progress' || s === 'in_review' || s === 'qa') return 'in_progress';
  return 'todo';
}
function bucketCounts(list: Story[]) {
  const c: Record<StatusBucket, number> = { todo: 0, in_progress: 0, done: 0 };
  for (const s of list) c[bucketOf(s.status)] += 1;
  return c;
}

function fmtSprintDates(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start && !end) return null;
  const f = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  return `${f(start)} → ${f(end)}`;
}

const STATUS_LABEL: Record<StoryStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  qa: 'QA',
  done: 'Done',
};

// Resolve the workflow column a story currently sits in — same logic the board
// uses. Prefer the explicit statusId (the real/imported column); fall back to
// the first column matching the story's core status; undefined while the
// project's workflow is still loading (callers then fall back to the core pill).
function resolveStoryRow(
  story: Story,
  workflow: WorkflowStatus[],
): WorkflowStatus | undefined {
  if (story.statusId) {
    const exact = workflow.find((w) => w.id === story.statusId);
    if (exact) return exact;
  }
  return workflow.find((w) => w.coreStatus === story.status);
}

// A status pill driven by a dynamic workflow row (imported Jira column), tinted
// with the row's own color — matching the board's column accent (`${color}1f`
// background, full-color text).
function WorkflowPill({ row }: { row: WorkflowStatus }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: `${row.color}1f`, color: row.color }}
      title={row.label}
    >
      {row.label}
    </span>
  );
}

// Render a story's status as a pill: the workflow-row pill when the project's
// columns are available, otherwise the legacy core-status pill. One helper so
// every surface (row, menus, read-only) stays consistent.
function StoryStatusPill({
  story,
  workflow,
}: {
  story: Story;
  workflow: WorkflowStatus[];
}) {
  const row = resolveStoryRow(story, workflow);
  return row ? <WorkflowPill row={row} /> : <StatusPill status={story.status} />;
}

// Last-seen sprint-lane stories per project, kept at module scope so they
// SURVIVE navigation away and back — the same way the backlog section's redux
// `stories.list` persists. Without this, sprint lanes (local state) cold-start
// with a skeleton on every re-entry while the backlog shows its cached list
// instantly. Seeded into local state on mount, then refreshed in the background.
const sprintStoriesCache = new Map<string, Record<string, Story[]>>();

export function Backlog() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const stories = useAppSelector((s) => s.stories.list);
  // The story currently open in the global drawer (`?story=`). Its edits land
  // here in redux; we mirror them into the (local-state) sprint lanes below.
  const selectedStory = useAppSelector((s) => s.stories.selected);
  const epics = useAppSelector((s) => (id ? s.epics.byProject[id] ?? [] : []));
  const labels = useAppSelector((s) => (id ? s.labels.byProject[id] ?? [] : []));
  const sprints = useAppSelector((s) => (id ? s.sprints.byProject[id] ?? [] : []));
  // Dynamic workflow columns (imported from Jira) — the board renders these, and
  // now the backlog drives its status filter, pills, and change menus off them.
  const workflow = useAppSelector((s) => (id ? s.workflow.byProject[id] ?? [] : []));
  const members = useAppSelector((s) => s.projects.currentMembers);
  const projects = useAppSelector((s) => s.projects.list);
  const project = projects.find((p) => p.id === id) ?? null;
  const { canInProject } = useCurrentProject();
  const { requestComplete, requestBulkComplete, guardDialog } = useSubtaskCompletionGuard();
  const { user } = useAuth();

  const epicFilter = params.get('epic') ?? '';
  const labelFilter = params.get('label') ?? '';
  const priorityFilter = (params.get('priority') as Priority | null) ?? '';
  const typeFilter = (params.get('type') as StoryType | null) ?? '';
  // Now a WorkflowStatus.id (a specific imported column), not a core status.
  const statusFilter = params.get('statusId') ?? '';
  const assigneeFilter = params.get('assignee') ?? '';
  const search = params.get('q') ?? '';
  const customFieldFilter = collectCustomFieldFilters(params);
  const { fields: customFieldDefs } = useCustomFields(id);
  const filterableCustomFields = customFieldDefs.filter(
    (f) => f.type === 'select' || f.type === 'checkbox',
  );

  const activeFilterCount =
    [epicFilter, labelFilter, priorityFilter, typeFilter, statusFilter, assigneeFilter].filter(
      Boolean,
    ).length + countCustomFieldFilters(params);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Seed from the cross-navigation cache so re-entering the page shows the last
  // sprint stories immediately (no skeleton), mirroring the redux-backed backlog.
  const [sprintStoriesById, setSprintStoriesById] = useState<Record<string, Story[]>>(
    () => (id ? sprintStoriesCache.get(id) ?? {} : {}),
  );
  // Drives lane skeletons. Starts TRUE when we already have cached data for this
  // project (show it instantly, refresh quietly); only a true cold load shows a
  // skeleton. Once loaded, a lane with no bucket entry reads as "0 issues".
  const [sprintStoriesLoaded, setSprintStoriesLoaded] = useState(
    () => (id ? sprintStoriesCache.has(id) : false),
  );
  const [draggedStory, setDraggedStory] = useState<Story | null>(null);
  // The lane the drag is currently hovering (sprint id, BACKLOG_LANE, or null).
  // Drives a continuous drop-target glow on the whole section while dragging —
  // including when the pointer is over a ROW inside it (where the section's own
  // dnd `isOver` is false because the row is the immediate droppable).
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [startCandidate, setStartCandidate] = useState<Sprint | null>(null);
  const [completeCandidate, setCompleteCandidate] = useState<Sprint | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Story | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Anchor for shift-click range select. Tracks the last story whose checkbox
  // the user clicked without shift held, so a follow-up shift-click can resolve
  // the range from there to the new click.
  const selectionAnchorRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchEpicsThunk(id));
    void dispatch(fetchLabelsThunk(id));
    void dispatch(fetchMembersThunk(id));
    void dispatch(fetchSprintsThunk(id));
    void dispatch(fetchWorkflowThunk(id));
  }, [dispatch, id, projects.length]);

  // The active filters WITHOUT a lane (sprintId), so the SAME set applies to the
  // backlog AND every sprint lane — the filter now spans the whole page, not
  // just the backlog section.
  const commonFilters = useMemo(
    () => ({
      epicId: epicFilter || undefined,
      labelId: labelFilter || undefined,
      priority: (priorityFilter as Priority) || undefined,
      type: (typeFilter as StoryType) || undefined,
      statusId: statusFilter || undefined,
      assigneeId: assigneeFilter || undefined,
      search: search || undefined,
      // Subtasks are hidden from the backlog by default, but a text search should
      // still find them — otherwise searching a subtask's title returns nothing.
      includeSubtasks: search ? ('true' as const) : undefined,
      customFields: customFieldFilter,
    }),
    [epicFilter, labelFilter, priorityFilter, typeFilter, statusFilter, assigneeFilter, search, customFieldFilter],
  );

  const backlogFilters = useMemo(
    () => ({ projectId: id!, sprintId: 'null' as const, ...commonFilters }),
    [id, commonFilters],
  );

  useEffect(() => {
    if (!id) return;
    void dispatch(fetchStoriesThunk(backlogFilters));
  }, [dispatch, id, backlogFilters]);

  const plannedSprints = sprints.filter((s) => s.status === 'planned');
  const activeSprint = sprints.find((s) => s.status === 'active') ?? null;
  // Order: planned sprints first, active sprint LAST so it sits directly
  // above the backlog — minimizes drag distance between the two sections
  // users move issues between most often.
  const sprintLanes = useMemo(
    () => [...plannedSprints, activeSprint].filter((sp): sp is NonNullable<typeof sp> => !!sp),
    [activeSprint, plannedSprints],
  );

  const refreshSprintStories = async (sprintId: string) => {
    if (!id) return;
    try {
      const rows = await storyApi.list({ projectId: id, sprintId, ...commonFilters });
      setSprintStoriesById((prev) => ({ ...prev, [sprintId]: rows }));
    } catch {
      /* non-fatal */
    }
  };

  // Refetch every visible lane (backlog + each sprint) for the on-demand
  // refresh button. Preserves scroll/filters/selection since those live in
  // URL params and component state — only the lists rerender in place.
  const onRefreshBacklog = async () => {
    if (!id || refreshing) return;
    setRefreshing(true);
    try {
      const sprintResults = await Promise.allSettled(
        sprintLanes.map(async (sp) => {
          const rows = await storyApi.list({ projectId: id, sprintId: sp.id, ...commonFilters });
          return { sprintId: sp.id, rows };
        }),
      );
      const okSprintEntries: [string, Story[]][] = [];
      let sprintFail = 0;
      for (const r of sprintResults) {
        if (r.status === 'fulfilled') okSprintEntries.push([r.value.sprintId, r.value.rows]);
        else sprintFail += 1;
      }
      if (okSprintEntries.length > 0) {
        setSprintStoriesById((prev) => {
          const next = { ...prev };
          for (const [sid, rows] of okSprintEntries) next[sid] = rows;
          return next;
        });
      }
      const backlogResult = await dispatch(fetchStoriesThunk(backlogFilters));
      const backlogOk = backlogResult.meta.requestStatus === 'fulfilled';
      if (!backlogOk || sprintFail > 0) {
        const msg = backlogOk
          ? `Refreshed — could not refresh ${sprintFail} sprint${sprintFail === 1 ? '' : 's'}`
          : (backlogResult.payload as string) || 'Could not refresh backlog';
        toast.error(msg);
      } else {
        toast.success('Backlog refreshed');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not refresh backlog');
    } finally {
      setRefreshing(false);
    }
  };

  // Load EVERY open-sprint lane's issues in ONE request, bucketed by sprint.
  // This fires at mount in parallel with the sprint-LIST fetch instead of waiting
  // for it — the old per-lane loop depended on `sprintLanes`, so it couldn't even
  // start until the sprint list resolved, making the sprint sections visibly lag
  // the backlog (a two-hop waterfall). The `inOpenSprints` server filter returns
  // active+planned sprint stories across all such sprints, so one round-trip
  // populates all lanes and completed-sprint issues are never over-fetched.
  // `commonFilters` is in the deps so the page-wide filter spans sprints too.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Only skeleton on a true cold load. With cached data we keep showing it and
    // refresh in the background — no skeleton flash on re-entry or filter change.
    if (!sprintStoriesCache.has(id)) setSprintStoriesLoaded(false);
    void (async () => {
      try {
        const rows = await storyApi.list({ projectId: id, inOpenSprints: 'true', ...commonFilters });
        if (cancelled) return;
        const byId: Record<string, Story[]> = {};
        for (const s of rows) {
          if (s.sprintId) (byId[s.sprintId] ??= []).push(s);
        }
        setSprintStoriesById(byId);
      } catch {
        /* non-fatal — lanes fall back to empty once loaded */
      } finally {
        if (!cancelled) setSprintStoriesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, commonFilters]);

  // Mirror the lane state into the cross-navigation cache so the NEXT visit
  // renders instantly. Covers both the fetch above and in-place mutation edits.
  useEffect(() => {
    if (id && sprintStoriesLoaded) sprintStoriesCache.set(id, sprintStoriesById);
  }, [id, sprintStoriesById, sprintStoriesLoaded]);

  // Keep the sprint lanes (local state) in sync with edits made in the global
  // story drawer. The drawer writes only to redux (`stories.selected` / `.list`),
  // so the redux-backed backlog section updates instantly while sprint cards —
  // which live in `sprintStoriesById` — would otherwise stay stale until a
  // refetch. Patch the matching card in place; only the lane holding it gets a
  // new array reference, so memoized rows in other lanes don't re-render.
  useEffect(() => {
    if (!selectedStory) return;
    setSprintStoriesById((prev) => {
      let changed = false;
      const next: Record<string, Story[]> = {};
      for (const [laneId, list] of Object.entries(prev)) {
        const idx = list.findIndex((s) => s.id === selectedStory.id);
        if (idx < 0) {
          next[laneId] = list;
          continue;
        }
        const copy = list.slice();
        copy[idx] = { ...copy[idx], ...selectedStory };
        next[laneId] = copy;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedStory]);

  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };
  const clearFilters = () => {
    const p = new URLSearchParams(params);
    ['epic', 'label', 'priority', 'type', 'statusId', 'assignee', 'q'].forEach((k) => p.delete(k));
    clearCustomFieldFilters(p);
    setParams(p, { replace: true });
  };
  const openStory = (storyKey: string) => {
    const p = new URLSearchParams(params);
    p.set('story', storyKey);
    setParams(p);
  };
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const onCreateSprint = () => setCreateSprintOpen(true);

  // ── DnD ─────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragStart = (e: DragStartEvent) => {
    const s = (e.active.data.current as { story?: Story } | undefined)?.story ?? null;
    setDraggedStory(s);
  };
  // Resolve which lane the current drop target belongs to, whether the pointer
  // is over a lane/backlog zone or a row inside one. Powers the section glow.
  const onDragOver = (e: DragOverEvent) => {
    const over = e.over;
    if (!over) {
      setDropLane(null);
      return;
    }
    const data = over.data.current as { type?: 'row'; laneId?: string } | undefined;
    if (over.id === BACKLOG_DROP_ID) setDropLane(BACKLOG_LANE);
    else if (typeof over.id === 'string' && over.id.startsWith('zone:sprint:'))
      setDropLane(over.id.slice('zone:sprint:'.length));
    else if (data?.type === 'row' && data.laneId) setDropLane(data.laneId);
    else setDropLane(null);
  };
  const onDragCancel = () => {
    setDraggedStory(null);
    setDropLane(null);
  };
  const onDragEnd = async (e: DragEndEvent) => {
    setDraggedStory(null);
    setDropLane(null);
    const story = (e.active.data.current as { story?: Story } | undefined)?.story;
    const over = e.over;
    if (!story || !over) return;
    if (!canInProject('story:sprint-move')) {
      toast.error("You don't have permission to move stories.");
      return;
    }

    const overData = over.data.current as
      | { type?: 'row'; story?: Story; laneId?: string }
      | undefined;
    const sourceLane = story.sprintId ?? BACKLOG_LANE;
    const isMultiDrag = selection.size > 1 && selection.has(story.id);

    // ── Same-lane reorder: a single row dropped onto another row in its own
    // lane. Only `rank` changes — cross-lane moves fall through to the existing
    // sprint-move logic below, which is untouched. Multi-drag never reorders.
    if (
      !isMultiDrag &&
      overData?.type === 'row' &&
      overData.story &&
      overData.laneId === sourceLane &&
      overData.story.id !== story.id
    ) {
      const isBacklog = sourceLane === BACKLOG_LANE;
      const current = isBacklog ? stories : sprintStoriesById[sourceLane] ?? [];
      const oldIndex = current.findIndex((s) => s.id === story.id);
      const newIndex = current.findIndex((s) => s.id === overData.story!.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const ordered = arrayMove(current, oldIndex, newIndex);
      const pos = ordered.findIndex((s) => s.id === story.id);
      const prevId = pos > 0 ? ordered[pos - 1].id : null;
      const nextId = pos < ordered.length - 1 ? ordered[pos + 1].id : null;
      // Optimistic: redux backlog list reorders in place; sprint lanes live in
      // local state, so set the reordered array directly.
      if (isBacklog) dispatch(optimisticReorder({ id: story.id, prevId }));
      else setSprintStoriesById((prev) => ({ ...prev, [sourceLane]: ordered }));
      const r = await dispatch(reorderStoryThunk({ id: story.id, prevId, nextId }));
      if (r.meta.requestStatus !== 'fulfilled') {
        if (isBacklog) void dispatch(fetchStoriesThunk(backlogFilters));
        else void refreshSprintStories(sourceLane);
        toast.error((r.payload as string) ?? 'Could not reorder — reverted');
      }
      return;
    }

    // ── Cross-lane move (existing behaviour). Resolve the target lane from the
    // drop zone OR from the row that was dropped on (its laneId). ──
    let nextSprintId: string | null;
    if (over.id === BACKLOG_DROP_ID || (overData?.type === 'row' && overData.laneId === BACKLOG_LANE)) {
      nextSprintId = null;
    } else if (typeof over.id === 'string' && over.id.startsWith('zone:sprint:')) {
      nextSprintId = over.id.slice('zone:sprint:'.length);
    } else if (overData?.type === 'row' && overData.laneId && overData.laneId !== BACKLOG_LANE) {
      nextSprintId = overData.laneId;
    } else {
      return;
    }

    // Multi-drag: if the picked-up story is part of an active selection,
    // move the entire selection. Otherwise fall through to single-row move.
    if (isMultiDrag) {
      // Resolve selection back to Story objects from any lane and skip
      // anything already in the target zone (no-op moves).
      const all: Story[] = [...stories, ...Object.values(sprintStoriesById).flat()];
      const seen = new Set<string>();
      const targets: Story[] = [];
      for (const s of all) {
        if (selection.has(s.id) && !seen.has(s.id) && s.sprintId !== nextSprintId) {
          seen.add(s.id);
          targets.push(s);
        }
      }
      if (targets.length === 0) return;
      setBulkBusy(true);
      const targetIds = new Set(targets.map((s) => s.id));
      setSprintStoriesById((prev) => {
        const next: Record<string, Story[]> = {};
        for (const [k, list] of Object.entries(prev)) next[k] = list.filter((s) => !targetIds.has(s.id));
        if (nextSprintId) {
          next[nextSprintId] = [
            ...(next[nextSprintId] ?? []),
            ...targets.map((s) => ({ ...s, sprintId: nextSprintId }) as Story),
          ];
        }
        return next;
      });
      const results = await Promise.allSettled(
        targets.map((s) =>
          dispatch(changeStorySprintThunk({ id: s.id, sprintId: nextSprintId })).unwrap(),
        ),
      );
      setBulkBusy(false);
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      const dest = nextSprintId
        ? sprintLanes.find((l) => l.id === nextSprintId)?.name ?? 'sprint'
        : 'backlog';
      if (ok > 0) toast.success(`Moved ${ok} issue${ok === 1 ? '' : 's'} → ${dest}`);
      if (fail > 0) toast.error(`Failed to move ${fail} issue${fail === 1 ? '' : 's'}`);
      clearSelection();
      void dispatch(fetchStoriesThunk(backlogFilters));
      sprintLanes.forEach((sp) => void refreshSprintStories(sp.id));
      return;
    }

    if (story.sprintId === nextSprintId) return;

    // Where in the target lane was it dropped? Default = bottom; if dropped onto
    // a row in that lane, take that row's slot so it lands exactly there. The
    // moved story isn't in `targetList` yet (it's coming from another lane), so
    // these neighbours are the cards it should sit between.
    const targetLane = nextSprintId ?? BACKLOG_LANE;
    const targetList = nextSprintId ? sprintStoriesById[nextSprintId] ?? [] : stories;
    let insertIndex = targetList.length;
    if (overData?.type === 'row' && overData.story && overData.laneId === targetLane) {
      const idx = targetList.findIndex((s) => s.id === overData.story!.id);
      if (idx >= 0) {
        // Released on the lower half of the row → drop AFTER it; upper half → before.
        const activeRect = e.active.rect.current.translated;
        const overRect = e.over?.rect;
        const below =
          !!activeRect && !!overRect && activeRect.top > overRect.top + overRect.height / 2;
        insertIndex = below ? idx + 1 : idx;
      }
    }
    const prevId = insertIndex > 0 ? targetList[insertIndex - 1].id : null;
    const nextId = insertIndex < targetList.length ? targetList[insertIndex].id : null;

    // Optimistic: drop the card into the target lane AT the drop position.
    setSprintStoriesById((prev) => {
      const next: Record<string, Story[]> = {};
      for (const [k, list] of Object.entries(prev)) next[k] = list.filter((s) => s.id !== story.id);
      if (nextSprintId) {
        const cur = next[nextSprintId] ?? [];
        const moved = { ...story, sprintId: nextSprintId } as Story;
        next[nextSprintId] = [...cur.slice(0, insertIndex), moved, ...cur.slice(insertIndex)];
      }
      return next;
    });
    // Reconcile the redux backlog list so the card doesn't appear in BOTH the
    // backlog and the sprint lane during the round-trip. When dropping into the
    // backlog, `prevId` is the backlog neighbour above the drop slot.
    dispatch(
      optimisticSprintMove({
        story,
        nextSprintId,
        backlogPrevId: nextSprintId ? null : prevId,
      }),
    );

    const r = await dispatch(changeStorySprintThunk({ id: story.id, sprintId: nextSprintId }));
    if (r.meta.requestStatus === 'fulfilled') {
      // Persist the drop position via rank so the card STICKS where dropped and
      // isn't auto-sorted back. Skip when the lane was empty (no neighbours).
      if (prevId || nextId) {
        await dispatch(reorderStoryThunk({ id: story.id, prevId, nextId }));
      }
      toast.success(nextSprintId ? `Moved ${story.key} → sprint` : `Moved ${story.key} → backlog`);
    } else {
      toast.error((r.payload as string) ?? 'Could not move story');
      // Roll back to server truth — only on failure, so a slow in-flight reload
      // can't clobber a newer optimistic move on the success path.
      void dispatch(fetchStoriesThunk(backlogFilters));
      if (nextSprintId) void refreshSprintStories(nextSprintId);
      if (story.sprintId) void refreshSprintStories(story.sprintId);
    }
  };

  // Flattened list of every visible story in the order they appear on screen:
  // sprint lanes top-to-bottom, then the backlog. Drives shift-click range
  // selection and the Ctrl/Cmd+A "select all" shortcut.
  const orderedStories = useMemo<Story[]>(() => {
    const out: Story[] = [];
    for (const sp of sprintLanes) {
      const list = sprintStoriesById[sp.id] ?? [];
      out.push(...list);
    }
    out.push(...stories);
    return out;
  }, [sprintLanes, sprintStoriesById, stories]);

  // ── Backlog-page keyboard shortcuts ──────────────────────────────────
  // These need this page's selection / filter / search state, so they live
  // here rather than in AppLayout. Global shortcuts (?, c, Ctrl+K, Shift+A,
  // Shift+R) are registered in AppLayout and work everywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inEditable = isTextEditableTarget(e.target);
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd+A — select every visible story. Skip when typing so the
      // browser's native "select all text" still works inside inputs.
      if (mod && (e.key === 'a' || e.key === 'A') && !inEditable) {
        if (orderedStories.length === 0) return;
        e.preventDefault();
        setSelection(new Set(orderedStories.map((s) => s.id)));
        return;
      }
      if (mod) return; // ignore other modifier combos

      if (inEditable) {
        // Inside a real text field, let the input handle every key — except
        // Esc, which we use to blur out of the search box.
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          break;
        case 'Escape':
          if (selection.size > 0) {
            setSelection(new Set());
            selectionAnchorRef.current = null;
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          setFiltersOpen((v) => !v);
          break;
        case 'Delete':
        case 'Backspace':
          if (selection.size > 0 && canInProject('story:delete')) {
            e.preventDefault();
            setBulkDeleteOpen(true);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedStories, selection.size, canInProject]);

  const canMove = canInProject('story:sprint-move');
  const canEdit = canInProject('story:edit');
  const canChangeStatus = canInProject('story:status');
  const canAssign = canInProject('story:assign');
  const canDelete = canInProject('story:delete');
  // Stable prop objects for the memoized StoryRow. Without these, every render
  // would hand each row a fresh `caps`/`members` reference and defeat React.memo
  // — so a single drag pickup would re-render all N rows (the big-project lag).
  const caps = useMemo<RowCaps>(
    () => ({ canMove, canChangeStatus, canAssign, canDelete, canEdit }),
    [canMove, canChangeStatus, canAssign, canDelete, canEdit],
  );
  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, name: m.user.name })),
    [members],
  );

  // Stable `actions`/`onSelectStory` references. The ref is refreshed on every
  // render (below), so these constant-identity callbacks always invoke the
  // latest closures — giving us stable props AND fresh state with no staleness.
  const latestRef = useRef<{
    openStory: (key: string) => void;
    onCopyKey: (s: Story) => void;
    onAssignStory: (s: Story, assigneeId: string | null) => void;
    onMoveStoryToSprint: (s: Story, sprintId: string | null) => void;
    onChangeStoryStatus: (s: Story, statusRowId: string) => void;
    onDeleteStory: (s: Story) => void;
    selectStory: (id: string, shiftKey: boolean) => void;
    userId: string | null;
  } | null>(null);
  const stableActions = useMemo<RowActions>(
    () => ({
      onOpen: (s) => latestRef.current!.openStory(s.key),
      onCopyKey: (s) => latestRef.current!.onCopyKey(s),
      onAssignToMe: (s) => latestRef.current!.onAssignStory(s, latestRef.current!.userId),
      onUnassign: (s) => latestRef.current!.onAssignStory(s, null),
      onAssign: (s, userId) => latestRef.current!.onAssignStory(s, userId),
      onMoveToBacklog: (s) => latestRef.current!.onMoveStoryToSprint(s, null),
      onMoveToSprint: (s, sprintId) => latestRef.current!.onMoveStoryToSprint(s, sprintId),
      onChangeStatus: (s, status) => latestRef.current!.onChangeStoryStatus(s, status),
      onDelete: (s) => latestRef.current!.onDeleteStory(s),
    }),
    [],
  );
  const stableSelectStory = useCallback((storyId: string, shiftKey: boolean) => {
    latestRef.current!.selectStory(storyId, shiftKey);
  }, []);

  if (!id) return null;
  // Global admins keep `canAssign` permission everywhere, but they can only
  // assign someone who is a member of THIS project. The current user can only
  // assign issues to themselves if they're on the project too — otherwise
  // the server rejects the assign with 400.
  const isCurrentUserMember = !!user?.id && memberOptions.some((m) => m.id === user.id);

  // Patch a story in-place wherever it lives in the LOCAL sprint lanes (the
  // backlog list lives in redux and is patched there). Lets status / assignee
  // changes reflect instantly in a sprint lane without a refetch.
  const patchLocalLanes = (storyId: string, patch: Partial<Story>) => {
    setSprintStoriesById((prev) => {
      let changed = false;
      const next: Record<string, Story[]> = {};
      for (const [k, list] of Object.entries(prev)) {
        next[k] = list.map((s) => {
          if (s.id !== storyId) return s;
          changed = true;
          return { ...s, ...patch } as Story;
        });
      }
      return changed ? next : prev;
    });
  };

  // Full reload from the server. Used to roll back a FAILED optimistic single
  // mutation, and to reconcile after BULK ops (which await all their sub-ops
  // first). Deliberately NOT fired on the success path of single mutations:
  // fire-and-forget refetches from overlapping mutations used to land late and
  // clobber a newer optimistic move, so the next drag appeared to do nothing
  // until a manual page refresh.
  const reloadFromServer = () => {
    void dispatch(fetchStoriesThunk(backlogFilters));
    sprintLanes.forEach((sp) => void refreshSprintStories(sp.id));
  };

  // ── Row-action handlers ─────────────────────────────────────────────
  const onMoveStoryToSprint = async (story: Story, sprintId: string | null) => {
    if (story.sprintId === sprintId) return;
    // Optimistic on BOTH stores: local sprint lanes + the redux backlog list,
    // so the card leaves its old home and lands in the new one immediately.
    setSprintStoriesById((prev) => {
      const next: Record<string, Story[]> = {};
      for (const [k, list] of Object.entries(prev)) next[k] = list.filter((s) => s.id !== story.id);
      if (sprintId) next[sprintId] = [...(next[sprintId] ?? []), { ...story, sprintId } as Story];
      return next;
    });
    dispatch(optimisticSprintMove({ story, nextSprintId: sprintId, backlogPrevId: null }));
    const r = await dispatch(changeStorySprintThunk({ id: story.id, sprintId }));
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(sprintId ? `Moved ${story.key} → sprint` : `Moved ${story.key} → backlog`);
    } else {
      toast.error((r.payload as string) ?? 'Could not move story');
      reloadFromServer();
    }
  };

  const onChangeStoryStatus = async (story: Story, statusRowId: string) => {
    if (story.statusId === statusRowId) return;
    const row = workflow.find((w) => w.id === statusRowId);
    const persist = async (cascadeSubtasks: boolean) => {
      // Optimistic flip (sets statusId AND derives the core status) so the pill
      // updates instantly — same pattern the board uses on drag.
      if (row) {
        dispatch(
          optimisticStatusRowChange({ id: story.id, statusId: row.id, coreStatus: row.coreStatus }),
        );
        // Reflect the change in a sprint lane too (lanes are local state, not redux).
        patchLocalLanes(story.id, { statusId: row.id, status: row.coreStatus });
      }
      const r = await dispatch(changeStoryStatusRowThunk({ id: story.id, statusRowId, cascadeSubtasks }));
      if (r.meta.requestStatus === 'fulfilled') {
        patchLocalLanes(story.id, r.payload as Story);
        toast.success(`${story.key} → ${row?.label ?? 'updated'}`);
      } else {
        toast.error((r.payload as string) ?? 'Could not change status');
        reloadFromServer();
      }
    };
    // Soft-warn before completing a parent that still has open subtasks. Guard
    // runs BEFORE the optimistic flip, so a cancel leaves the pill untouched.
    await requestComplete({
      storyId: story.id,
      storyKey: story.key,
      storyTitle: story.title,
      targetIsDone: row?.coreStatus === 'done',
      subtaskCount: story._count?.subtasks,
      onProceed: persist,
    });
  };

  const onAssignStory = async (story: Story, assigneeId: string | null) => {
    if (story.assignee?.id === assigneeId || (!story.assignee && assigneeId === null)) return;
    const r = await dispatch(updateStoryThunk({ id: story.id, input: { assigneeId } }));
    if (r.meta.requestStatus === 'fulfilled') {
      // Redux list is patched by updateStoryThunk.fulfilled; mirror into the
      // local sprint lane (with the server's full assignee) so it shows there too.
      patchLocalLanes(story.id, r.payload as Story);
      toast.success(assigneeId ? `${story.key} assigned` : `${story.key} unassigned`);
    } else {
      toast.error((r.payload as string) ?? 'Could not change assignee');
      reloadFromServer();
    }
  };

  const onCopyKey = async (story: Story) => {
    try {
      await navigator.clipboard.writeText(story.key);
      toast.success(`Copied ${story.key}`);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const onDeleteStory = (story: Story) => {
    setDeleteCandidate(story);
  };

  const onConfirmDeleteStory = async () => {
    const story = deleteCandidate;
    if (!story) return;
    setDeleting(true);
    // Close the side panel first if it's showing this story — otherwise the
    // panel's child components (ActivityFeed, AttachmentGallery, CommentsThread)
    // race their in-flight fetches against the just-deleted id and each emit
    // a "Story not found" toast.
    if (params.get('story') === story.key) {
      const p = new URLSearchParams(params);
      p.delete('story');
      setParams(p, { replace: true });
    }
    setSprintStoriesById((prev) => {
      const next: Record<string, Story[]> = {};
      for (const [k, list] of Object.entries(prev)) next[k] = list.filter((s) => s.id !== story.id);
      return next;
    });
    const r = await dispatch(deleteStoryThunk(story.id));
    setDeleting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      // Already removed from the local lanes above; deleteStoryThunk.fulfilled
      // drops it from the redux backlog list. No refetch needed.
      toast.success(`Deleted ${story.key}`);
      setDeleteCandidate(null);
    } else {
      toast.error((r.payload as string) ?? 'Could not delete story');
      reloadFromServer();
    }
  };

  // ── Multi-select & bulk operations ──────────────────────────────────

  const selectStory = (storyId: string, shiftKey: boolean) => {
    if (shiftKey && selectionAnchorRef.current && selectionAnchorRef.current !== storyId) {
      const anchor = selectionAnchorRef.current;
      const aIdx = orderedStories.findIndex((s) => s.id === anchor);
      const bIdx = orderedStories.findIndex((s) => s.id === storyId);
      if (aIdx !== -1 && bIdx !== -1) {
        const [from, to] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        setSelection((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i += 1) next.add(orderedStories[i].id);
          return next;
        });
        selectionAnchorRef.current = storyId;
        return;
      }
    }
    // No shift, or the anchor went stale (story was moved/deleted): plain toggle.
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
    selectionAnchorRef.current = storyId;
  };
  const clearSelection = () => {
    setSelection(new Set());
    selectionAnchorRef.current = null;
  };

  // Resolve current selection back into Story objects from any lane.
  const collectSelectedStories = (): Story[] => {
    const all: Story[] = [...stories, ...Object.values(sprintStoriesById).flat()];
    const seen = new Set<string>();
    const out: Story[] = [];
    for (const s of all) {
      if (selection.has(s.id) && !seen.has(s.id)) {
        seen.add(s.id);
        out.push(s);
      }
    }
    return out;
  };

  const onBulkMove = async (targetSprintId: string | null) => {
    const selected = collectSelectedStories().filter((s) => s.sprintId !== targetSprintId);
    if (selected.length === 0) return;
    setBulkBusy(true);
    setSprintStoriesById((prev) => {
      const next: Record<string, Story[]> = {};
      for (const [k, list] of Object.entries(prev)) next[k] = list.filter((s) => !selection.has(s.id));
      return next;
    });
    const results = await Promise.allSettled(
      selected.map((s) =>
        dispatch(changeStorySprintThunk({ id: s.id, sprintId: targetSprintId })).unwrap(),
      ),
    );
    setBulkBusy(false);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    const dest = targetSprintId
      ? sprintLanes.find((l) => l.id === targetSprintId)?.name ?? 'sprint'
      : 'backlog';
    if (ok > 0) toast.success(`Moved ${ok} issue${ok === 1 ? '' : 's'} → ${dest}`);
    if (fail > 0) toast.error(`Failed to move ${fail} issue${fail === 1 ? '' : 's'}`);
    clearSelection();
    reloadFromServer();
  };

  const onBulkChangeStatus = async (statusRowId: string) => {
    const row = workflow.find((w) => w.id === statusRowId);
    const selected = collectSelectedStories().filter((s) => s.statusId !== statusRowId);
    if (selected.length === 0) return;
    const persist = async (cascadeSubtasks: boolean) => {
      setBulkBusy(true);
      const results = await Promise.allSettled(
        selected.map((s) =>
          dispatch(changeStoryStatusRowThunk({ id: s.id, statusRowId, cascadeSubtasks })).unwrap(),
        ),
      );
      setBulkBusy(false);
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      if (ok > 0)
        toast.success(`Updated ${ok} issue${ok === 1 ? '' : 's'} → ${row?.label ?? 'status'}`);
      if (fail > 0) toast.error(`Failed to update ${fail} issue${fail === 1 ? '' : 's'}`);
      clearSelection();
      reloadFromServer();
    };
    // Soft-warn when the bulk target is Done and some selected parent still has
    // open subtasks. The cascade flag is harmless for the rest (no-op server-side).
    await requestBulkComplete({
      stories: selected,
      targetIsDone: row?.coreStatus === 'done',
      onProceed: persist,
    });
  };

  const onBulkAssign = async (assigneeId: string | null) => {
    const selected = collectSelectedStories().filter(
      (s) => (s.assignee?.id ?? null) !== assigneeId,
    );
    if (selected.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(
      selected.map((s) =>
        dispatch(updateStoryThunk({ id: s.id, input: { assigneeId } })).unwrap(),
      ),
    );
    setBulkBusy(false);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    const who = assigneeId
      ? memberOptions.find((m) => m.id === assigneeId)?.name ?? 'assignee'
      : null;
    if (ok > 0) {
      toast.success(
        who
          ? `Assigned ${ok} issue${ok === 1 ? '' : 's'} → ${who}`
          : `Unassigned ${ok} issue${ok === 1 ? '' : 's'}`,
      );
    }
    if (fail > 0) toast.error(`Failed to update ${fail} issue${fail === 1 ? '' : 's'}`);
    clearSelection();
    reloadFromServer();
  };

  const onConfirmBulkDelete = async () => {
    const selected = collectSelectedStories();
    if (selected.length === 0) return;
    setDeleting(true);
    // If the side panel is showing one of the doomed stories, close it first
    // so its child fetches don't race against the delete.
    const openKey = params.get('story');
    if (openKey && selected.some((s) => s.key === openKey)) {
      const p = new URLSearchParams(params);
      p.delete('story');
      setParams(p, { replace: true });
    }
    setSprintStoriesById((prev) => {
      const next: Record<string, Story[]> = {};
      for (const [k, list] of Object.entries(prev)) next[k] = list.filter((s) => !selection.has(s.id));
      return next;
    });
    const results = await Promise.allSettled(
      selected.map((s) => dispatch(deleteStoryThunk(s.id)).unwrap()),
    );
    setDeleting(false);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (ok > 0) toast.success(`Deleted ${ok} issue${ok === 1 ? '' : 's'}`);
    if (fail > 0) toast.error(`Failed to delete ${fail} issue${fail === 1 ? '' : 's'}`);
    setBulkDeleteOpen(false);
    clearSelection();
    reloadFromServer();
  };

  // Refresh the stable-action ref with this render's live closures. `stableActions`
  // and `stableSelectStory` (defined above) call through here, so their identity
  // stays constant while their behavior always reflects current state.
  latestRef.current = {
    openStory,
    onCopyKey,
    onAssignStory,
    onMoveStoryToSprint,
    onChangeStoryStatus,
    onDeleteStory,
    selectStory,
    userId: user?.id ?? null,
  };

  // Section "key" used for collapse state — backlog uses 'backlog', sprints their id
  const isCollapsed = (k: string) => collapsed[k] === true;
  const toggle = (k: string) => setCollapsed((m) => ({ ...m, [k]: !m[k] }));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dndCollisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      {/* Jira-style layout: the toolbar + bulk-action bar are a FIXED header;
          only the issue-list region below scrolls. The root fills the height
          `main` gives us, and `min-h-0` on the list lets it shrink and own its
          own scrollbar instead of pushing the toolbar off-screen. */}
      <div className="flex h-full flex-col">
      {/* ── Toolbar (fixed header) ──────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to={`/projects/${id}`} className="hover:text-foreground hover:underline">
            {project?.name ?? 'Project'}
          </Link>
          <span>/</span>
          <span className="text-foreground">Backlog</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">Backlog</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                aria-label="Search backlog"
                placeholder="Search backlog issues  ( / )"
                value={search}
                onChange={(e) => setFilter('q', e.target.value)}
                className="h-8 w-[240px] pl-7 text-sm"
              />
            </div>
            <div className="flex items-center -space-x-1.5">
              {memberOptions.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFilter('assignee', assigneeFilter === m.id ? '' : m.id)}
                  className={cn(
                    'inline-block rounded-full ring-2 ring-background transition-transform',
                    assigneeFilter === m.id
                      ? 'scale-110 ring-primary'
                      : 'opacity-70 hover:opacity-100 hover:scale-105',
                  )}
                  title={`Filter by ${m.name}`}
                  aria-label={`Filter by ${m.name}`}
                >
                  <Avatar name={m.name} />
                </button>
              ))}
              {memberOptions.length > 5 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold ring-2 ring-background transition-colors hover:bg-muted/80',
                        memberOptions.slice(5).some((m) => m.id === assigneeFilter) &&
                          'bg-primary text-primary-foreground ring-primary',
                      )}
                      aria-label={`Show ${memberOptions.length - 5} more members`}
                      title={`${memberOptions.length - 5} more`}
                    >
                      +{memberOptions.length - 5}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                    <DropdownMenuLabel>More members</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {memberOptions.slice(5).map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onSelect={() =>
                          setFilter('assignee', assigneeFilter === m.id ? '' : m.id)
                        }
                        className={cn(
                          'flex items-center gap-2',
                          assigneeFilter === m.id && 'bg-primary/10 text-primary',
                        )}
                      >
                        <Avatar name={m.name} />
                        <span className="truncate">{m.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            <Button
              variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltersOpen((v) => !v)}
              className="h-8 gap-1.5 text-xs"
              title="Toggle filters (f)"
            >
              <FilterIcon className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 ? (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground/20 px-1 font-mono text-[10px]">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRefreshBacklog()}
              disabled={refreshing}
              className="h-8 w-8 p-0"
              aria-label="Refresh backlog"
              title="Refresh backlog"
              aria-busy={refreshing}
            >
              <RefreshCw
                className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
                aria-hidden
              />
            </Button>
            {canInProject('story:create') ? <CreateStoryDialog projectId={id} /> : null}
          </div>
        </div>

        {filtersOpen ? (
          <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-5">
            <FilterSelect
              label="Epic"
              value={epicFilter}
              onChange={(v) => setFilter('epic', v)}
              options={[
                { value: '', label: 'All epics' },
                { value: 'null', label: 'No epic' },
                ...epics.map((e) => ({ value: e.id, label: `${e.key} · ${e.title}` })),
              ]}
            />
            <FilterSelect
              label="Label"
              value={labelFilter}
              onChange={(v) => setFilter('label', v)}
              options={[
                { value: '', label: 'All labels' },
                ...labels.map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
            <FilterSelect
              label="Priority"
              value={priorityFilter}
              onChange={(v) => setFilter('priority', v)}
              options={[
                { value: '', label: 'Any' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />
            <FilterSelect
              label="Type"
              value={typeFilter}
              onChange={(v) => setFilter('type', v)}
              options={[
                { value: '', label: 'Any' },
                { value: 'story', label: 'Story' },
                { value: 'bug', label: 'Bug' },
                { value: 'task', label: 'Task' },
              ]}
            />
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={(v) => setFilter('statusId', v)}
              options={[
                { value: '', label: 'Any' },
                ...workflow.map((w) => ({ value: w.id, label: w.label })),
              ]}
            />
            {filterableCustomFields.map((f) => (
              <FilterSelect
                key={f.id}
                label={f.name}
                value={params.get(`${CF_PARAM_PREFIX}${f.id}`) ?? ''}
                onChange={(v) => setFilter(`${CF_PARAM_PREFIX}${f.id}`, v)}
                options={
                  f.type === 'checkbox'
                    ? [
                        { value: '', label: 'Any' },
                        { value: 'true', label: 'Yes' },
                        { value: 'false', label: 'No' },
                      ]
                    : [
                        { value: '', label: 'Any' },
                        ...f.options.map((o) => ({ value: o, label: o })),
                      ]
                }
              />
            ))}
            {activeFilterCount > 0 || search ? (
              <div className="flex items-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs">
                  <X className="h-3 w-3" />
                  Clear all
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Bulk-action toolbar (visible when selection is non-empty) ─── */}
      {selection.size > 0 ? (
        <div
          className="mt-3 flex shrink-0 flex-wrap items-center gap-2 rounded-md border bg-primary/10 px-3 py-2 text-sm shadow-sm"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <span className="font-medium">
            {selection.size} selected
          </span>
          <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 gap-1 text-xs">
            <X className="h-3 w-3" />
            Clear
          </Button>
          <span className="ml-2 h-4 w-px bg-border" aria-hidden />
          {canMove ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={bulkBusy}>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Move to
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void onBulkMove(null)}>
                  <ArrowDownToLine className="!text-sky-600" />
                  Backlog
                </DropdownMenuItem>
                {sprintLanes.length > 0 ? <DropdownMenuSeparator /> : null}
                {sprintLanes.map((sp) => (
                  <DropdownMenuItem key={sp.id} onSelect={() => void onBulkMove(sp.id)}>
                    {sp.status === 'active' ? (
                      <CheckCircle2 className="!text-emerald-600" />
                    ) : (
                      <CircleDashed className="!text-amber-600" />
                    )}
                    <span className="flex-1 truncate">{sp.name}</span>
                    {sp.status === 'active' ? (
                      <span className="ml-2 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        live
                      </span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canAssign ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={bulkBusy}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Assign
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user?.id && isCurrentUserMember ? (
                  <DropdownMenuItem onSelect={() => void onBulkAssign(user.id)}>
                    <UserPlus className="!text-emerald-600" />
                    Me ({user.name})
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => void onBulkAssign(null)}>
                  <UserX className="!text-amber-600" />
                  Unassign
                </DropdownMenuItem>
                {memberOptions.length > 0 ? <DropdownMenuSeparator /> : null}
                {memberOptions.map((m) => (
                  <DropdownMenuItem key={m.id} onSelect={() => void onBulkAssign(m.id)}>
                    <Avatar name={m.name} />
                    <span className="truncate">{m.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canChangeStatus ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={bulkBusy}>
                  <CircleDashed className="h-3.5 w-3.5" />
                  Change status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Set status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workflow.map((w) => (
                  <DropdownMenuItem key={w.id} onSelect={() => void onBulkChangeStatus(w.id)}>
                    <WorkflowPill row={w} />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkBusy}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          ) : null}
          {bulkBusy ? (
            <span className="ml-2 text-xs text-muted-foreground">Working…</span>
          ) : null}
        </div>
      ) : null}

      {/* ── Vertical sections (the ONLY scrolling region) ───────────── */}
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5">
        {sprintLanes.map((sp) => {
          // Lanes share ONE open-sprint fetch, so loading is page-level, not
          // per-lane: until it resolves every lane shows a skeleton; after it,
          // a lane with no bucket entry is genuinely empty (0 issues).
          const laneLoading = !sprintStoriesLoaded;
          const list = sprintStoriesById[sp.id] ?? [];
          const counts = bucketCounts(list);
          const points = list.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
          const dateRange = fmtSprintDates(sp.startDate, sp.endDate);
          return (
            <Section
              key={sp.id}
              droppableId={sprintDropId(sp.id)}
              disabled={!canMove}
              collapsed={isCollapsed(sp.id)}
              onToggle={() => toggle(sp.id)}
              kind={sp.status === 'active' ? 'active' : 'planned'}
              title={sp.name}
              loading={laneLoading}
              empty={list.length === 0}
              active={dropLane === sp.id}
              meta={
                <>
                  {laneLoading ? (
                    <span className="h-3.5 w-16 rounded bg-muted animate-pulse" aria-hidden />
                  ) : (
                    <>
                      <span className="text-muted-foreground/90">
                        {list.length} issue{list.length === 1 ? '' : 's'}
                      </span>
                      <StatusCounters counts={counts} />
                    </>
                  )}
                  {dateRange ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-sm bg-muted/60 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                      title={`Sprint dates · ${dateRange}`}
                    >
                      <CalendarDays className="h-3 w-3" aria-hidden />
                      {dateRange}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-sm bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] italic text-muted-foreground/70"
                      title="No dates set — set them when you start the sprint"
                    >
                      <CalendarDays className="h-3 w-3" aria-hidden />
                      No dates
                    </span>
                  )}
                </>
              }
              subtitle={sp.goal ?? undefined}
              notice={
                sp.status !== 'active' ? (
                  <SprintNotStartedNotice compact canStart={canInProject('sprint:start')} />
                ) : sp.endDate && new Date(sp.endDate).getTime() < Date.now() ? (
                  <SprintOverdueNotice
                    compact
                    canComplete={canInProject('sprint:complete')}
                    endDate={sp.endDate}
                  />
                ) : null
              }
              right={
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                    title={`Total story points in ${sp.name}: ${points}`}
                  >
                    {points} pts
                  </span>
                  {sp.status === 'active' ? (
                    canInProject('sprint:complete') ? (
                      <Button size="sm" variant="outline" onClick={() => setCompleteCandidate(sp)}>
                        Complete sprint
                      </Button>
                    ) : null
                  ) : !activeSprint && canInProject('sprint:start') ? (
                    <Button size="sm" onClick={() => setStartCandidate(sp)}>
                      Start sprint
                    </Button>
                  ) : null}
                </div>
              }
              emptyHint="Drop a backlog issue here to plan it for this sprint."
              footer={
                canInProject('story:create') ? (
                  <InlineCreateStoryRow
                    projectId={id!}
                    members={memberOptions}
                    sprintId={sp.id}
                    status="todo"
                    onCreated={() => {
                      // Show the new card in this lane, and refetch the backlog
                      // list so the just-created (sprint) story that createStory
                      // optimistically unshifted there is dropped from it.
                      void refreshSprintStories(sp.id);
                      void dispatch(fetchStoriesThunk(backlogFilters));
                    }}
                  />
                ) : null
              }
            >
              <SortableContext items={list.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {list.map((s) => (
                  <StoryRow
                    key={s.id}
                    story={s}
                    canDrag={canMove}
                    laneId={sp.id}
                    actions={stableActions}
                    sprintLanes={sprintLanes}
                    workflow={workflow}
                    caps={caps}
                    currentUserId={user?.id ?? null}
                    isSelected={selection.has(s.id)}
                    onSelectStory={stableSelectStory}
                    selectionActive={selection.size > 0}
                    multiDragActive={
                      draggedStory != null &&
                      selection.size > 1 &&
                      selection.has(draggedStory.id) &&
                      selection.has(s.id)
                    }
                    members={memberOptions}
                    currentUserCanBeAssignee={isCurrentUserMember}
                  />
                ))}
              </SortableContext>
            </Section>
          );
        })}

        {/* Backlog section (always present, last) */}
        <Section
          droppableId={BACKLOG_DROP_ID}
          disabled={!canMove}
          collapsed={isCollapsed('backlog')}
          onToggle={() => toggle('backlog')}
          kind="backlog"
          title="Backlog"
          empty={stories.length === 0}
          active={dropLane === BACKLOG_LANE}
          meta={
            <>
              <span className="text-muted-foreground/90">
                {stories.length} issue{stories.length === 1 ? '' : 's'}
              </span>
              <StatusCounters counts={bucketCounts(stories)} />
            </>
          }
          right={
            !activeSprint && plannedSprints.length === 0 && canInProject('sprint:create') ? (
              <Button size="sm" onClick={onCreateSprint} className="gap-1">
                <Plus className="h-3.5 w-3.5" />
                Create sprint
              </Button>
            ) : canInProject('sprint:create') ? (
              <Button variant="ghost" size="sm" onClick={onCreateSprint} className="gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" />
                New sprint
              </Button>
            ) : null
          }
          emptyHint={
            search || activeFilterCount > 0
              ? 'No issues match the current filters.'
              : 'No issues in backlog. Create one above.'
          }
          footer={
            canInProject('story:create') ? (
              <InlineCreateStoryRow
                projectId={id!}
                members={memberOptions}
                onCreated={() => void dispatch(fetchStoriesThunk(backlogFilters))}
              />
            ) : null
          }
        >
          <SortableContext items={stories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {stories.map((s) => (
              <StoryRow
                key={s.id}
                story={s}
                canDrag={canMove}
                laneId={BACKLOG_LANE}
                actions={stableActions}
                sprintLanes={sprintLanes}
                workflow={workflow}
                caps={caps}
                currentUserId={user?.id ?? null}
                isSelected={selection.has(s.id)}
                onSelectStory={stableSelectStory}
                selectionActive={selection.size > 0}
                multiDragActive={
                  draggedStory != null &&
                  selection.size > 1 &&
                  selection.has(draggedStory.id) &&
                  selection.has(s.id)
                }
                members={memberOptions}
                currentUserCanBeAssignee={isCurrentUserMember}
              />
            ))}
          </SortableContext>
        </Section>
      </div>
      </div>
      {/* ── end Jira-style fixed-header layout ───────────────────────── */}

      <DragOverlay dropAnimation={null}>
        {draggedStory ? (
          (() => {
            const isMulti = selection.size > 1 && selection.has(draggedStory.id);
            // Resolve the rest of the selection (in addition to the dragged
            // row) so we can stack up to 2 ghost layers behind the active
            // card — gives the user a clear "I'm moving a stack" cue.
            const all: Story[] = [...stories, ...Object.values(sprintStoriesById).flat()];
            const seen = new Set<string>([draggedStory.id]);
            const others: Story[] = [];
            if (isMulti) {
              for (const s of all) {
                if (selection.has(s.id) && !seen.has(s.id)) {
                  seen.add(s.id);
                  others.push(s);
                  if (others.length >= 2) break;
                }
              }
            }
            return (
              <div className="relative">
                {/* Stack ghosts: rendered first so the active card layers on top. */}
                {others.map((s, i) => (
                  <div
                    key={s.id}
                    className="absolute inset-0 rounded border bg-card shadow-[0_12px_24px_-12px_rgba(0,0,0,0.4)] ring-1 ring-primary/30"
                    style={{
                      transform: `translate(${(i + 1) * 6}px, ${(i + 1) * 6}px) rotate(${(i + 1) * 1.2}deg)`,
                      opacity: 0.85 - i * 0.15,
                      zIndex: 0 - i,
                    }}
                    aria-hidden
                  >
                    <StoryRowInner
                      story={s}
                      canDrag={false}
                      dragging
                      caps={{ canMove: false, canChangeStatus: false, canAssign: false, canDelete: false, canEdit: false }}
                      sprintLanes={[]}
                      workflow={workflow}
                      currentUserId={null}
                    />
                  </div>
                ))}
                <div className="relative rounded border bg-card shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-primary/40">
                  <StoryRowInner
                    story={draggedStory}
                    canDrag={false}
                    dragging
                    caps={{ canMove: false, canChangeStatus: false, canAssign: false, canDelete: false, canEdit: false }}
                    sprintLanes={[]}
                    workflow={workflow}
                    currentUserId={null}
                  />
                  {isMulti ? (
                    <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[11px] font-semibold text-primary-foreground shadow ring-2 ring-background">
                      +{selection.size - 1}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })()
        ) : null}
      </DragOverlay>

      <StartSprintDialog
        sprint={startCandidate}
        onOpenChange={(open) => !open && setStartCandidate(null)}
        onStarted={() => {
          setStartCandidate(null);
          if (id) void dispatch(fetchSprintsThunk(id));
        }}
      />
      <CompleteSprintDialog
        sprint={completeCandidate}
        onOpenChange={(open) => !open && setCompleteCandidate(null)}
        onCompleted={() => {
          setCompleteCandidate(null);
          if (id) void dispatch(fetchSprintsThunk(id));
        }}
      />
      {guardDialog}
      {id ? (
        <CreateSprintDialog
          projectId={id}
          open={createSprintOpen}
          onOpenChange={setCreateSprintOpen}
        />
      ) : null}

      <Dialog
        open={!!deleteCandidate}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteCandidate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete issue?</DialogTitle>
            <DialogDescription>
              {deleteCandidate ? (
                <>
                  <span className="font-mono font-medium">{deleteCandidate.key}</span>{' '}
                  <span className="font-medium">"{deleteCandidate.title}"</span> will be
                  permanently removed. This cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteCandidate(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmDeleteStory} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete issue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setBulkDeleteOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selection.size} issue{selection.size === 1 ? '' : 's'}?
            </DialogTitle>
            <DialogDescription>
              The selected issues will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmBulkDelete} disabled={deleting}>
              {deleting
                ? 'Deleting…'
                : `Delete ${selection.size} issue${selection.size === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}


// ── Section ─────────────────────────────────────────────────────────────────

function Section({
  droppableId,
  disabled,
  collapsed,
  onToggle,
  kind,
  title,
  meta,
  subtitle,
  notice,
  right,
  emptyHint,
  footer,
  loading = false,
  empty,
  active = false,
  children,
}: {
  droppableId: string;
  disabled?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  kind: 'active' | 'planned' | 'backlog';
  title: string;
  meta?: React.ReactNode;
  subtitle?: string;
  /** Optional soft banner rendered at the top of the lane body (e.g. the
   *  "sprint not started" notice on planned lanes). */
  notice?: React.ReactNode;
  right?: React.ReactNode;
  emptyHint: string;
  footer?: React.ReactNode;
  loading?: boolean;
  /** Whether the lane has zero rows — passed explicitly because `children` is now
   *  a SortableContext wrapper, so it can't be counted by inspecting children. */
  empty?: boolean;
  /** True while a drag's resolved drop target is THIS lane (pointer over the
   *  zone OR any row inside it) — drives the continuous drop-target glow. */
  active?: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: droppableId, disabled });
  // `active` (computed from the drag's target lane) is the authoritative cue;
  // `isOver` only fires when the section's own zone is the immediate droppable,
  // which misses the common case of hovering a row inside the lane.
  const showDrop = active || isOver;
  const hasChildren = !empty;

  // Gate the collapse transition behind a post-mount flag. The grid-rows
  // technique (1fr ↔ 0fr) animates on click — but Chrome also resolves `1fr`
  // from 0 on the first layout pass, so without this gate every section would
  // "expand in" on page entry. We render the first paint with no transition
  // class (static, fully expanded), then enable it so user toggles still slide.
  const [animateCollapse, setAnimateCollapse] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimateCollapse(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const accentDot = {
    active: 'bg-emerald-500',
    planned: 'bg-blue-500',
    backlog: 'bg-muted-foreground/40',
  }[kind];

  return (
    <section
      className={cn(
        'overflow-hidden rounded border bg-card transition-colors',
        showDrop && 'border-primary/60 ring-1 ring-primary/30',
      )}
    >
      {/* Header */}
      <header
        className={cn(
          'flex items-center gap-3 border-b bg-muted/30 px-3 py-2',
          showDrop && 'bg-primary/[0.06]',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-foreground hover:text-primary"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {/* One chevron that rotates instead of two that swap — gives the
              caret a smooth turn that matches the body's collapse. */}
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none',
              collapsed && '-rotate-90',
            )}
            aria-hidden
          />
          <span className={cn('h-2 w-2 rounded-full', accentDot)} aria-hidden />
          <span className="text-sm font-semibold">{title}</span>
        </button>
        <div className="flex flex-1 items-center gap-2 text-[11px]">{meta}</div>
        <div className="flex items-center gap-2">{right}</div>
      </header>

      {/* Body — always renders the droppable element so DnD targets the section
          even when collapsed/empty. The content collapses via an animated grid
          row (1fr → 0fr): a height-agnostic slide that needs no JS measuring and,
          unlike `height: auto`, the browser can actually interpolate. */}
      <div ref={setNodeRef} className={cn(showDrop && 'bg-primary/[0.04]')}>
        <div
          className={cn(
            'grid',
            animateCollapse &&
              'transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
            collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
          )}
        >
          {/* The single grid child must clip its overflow so the rows collapse
              cleanly; min-h-0 lets it shrink below its content height. */}
          <div className="min-h-0 overflow-hidden">
            {subtitle ? (
              <p className="border-b bg-muted/10 px-3 py-1.5 text-[11px] italic text-muted-foreground">
                Goal · {subtitle}
              </p>
            ) : null}
            {notice}
            {loading ? (
              <SkeletonRows />
            ) : hasChildren ? (
              <ul className="divide-y">{children}</ul>
            ) : (
              <div
                className={cn(
                  'flex items-center justify-center px-3 py-6 text-[12px] text-muted-foreground',
                  showDrop && 'border-2 border-dashed border-primary/40 text-primary',
                )}
              >
                {showDrop ? 'Release to drop here' : emptyHint}
              </div>
            )}
            {footer ? <div className="border-t bg-muted/10">{footer}</div> : null}
          </div>
        </div>

        {/* Collapsed drop affordance — keeps a real (non-zero) drop target while
            the body is collapsed, so DnD still lands on the section. */}
        {collapsed ? (
          <div className={cn('h-1 w-full', showDrop && 'h-8 bg-primary/[0.06]')}>
            {showDrop ? (
              <div className="flex h-full items-center justify-center text-[10.5px] uppercase tracking-wider text-primary">
                Drop into {title}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

// ── Skeleton rows (shown while a sprint lane's issues are still loading) ─────
// Opacity-only `animate-pulse` — deliberately NO transform/`animate-in` here:
// an animated transform on a row container forces every draggable <li> beneath
// it to re-composite each frame, which is exactly what caused the drag jitter
// regression. Rows match StoryRow's h-9 layout so there's no shift on swap-in.

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <ul className="divide-y" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex h-9 items-center gap-2 px-3">
          <span className="h-3.5 w-3.5 shrink-0 rounded-sm bg-muted animate-pulse" />
          <span className="h-3 w-12 shrink-0 rounded bg-muted animate-pulse" />
          <span
            className="h-3 flex-1 rounded bg-muted animate-pulse"
            style={{ maxWidth: `${52 - i * 8}%` }}
          />
          <span className="h-4 w-10 shrink-0 rounded bg-muted animate-pulse" />
          <span className="h-5 w-5 shrink-0 rounded-full bg-muted animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

// ── Status counters (Jira's grey/blue/green pills) ─────────────────────────

function StatusCounters({ counts }: { counts: Record<StatusBucket, number> }) {
  return (
    <div className="flex items-center gap-1">
      <Pip n={counts.todo} className="bg-muted-foreground/20 text-foreground/80" title="To do" />
      <Pip n={counts.in_progress} className="bg-blue-500/15 text-blue-700 dark:text-blue-300" title="In progress" />
      <Pip n={counts.done} className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" title="Done" />
    </div>
  );
}
function Pip({ n, className, title }: { n: number; className: string; title: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[22px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-semibold',
        className,
      )}
      title={`${title}: ${n}`}
    >
      {n}
    </span>
  );
}

// ── Story row (Jira's flat horizontal row) ─────────────────────────────────

interface RowCaps {
  canMove: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canEdit: boolean;
}

interface RowActions {
  onOpen: (s: Story) => void;
  onCopyKey: (s: Story) => void;
  onAssignToMe: (s: Story) => void;
  onUnassign: (s: Story) => void;
  onAssign: (s: Story, userId: string) => void;
  onMoveToBacklog: (s: Story) => void;
  onMoveToSprint: (s: Story, sprintId: string) => void;
  // Targets a specific workflow column (WorkflowStatus.id), not a core status.
  onChangeStatus: (s: Story, statusRowId: string) => void;
  onDelete: (s: Story) => void;
}

const StoryRow = memo(function StoryRow({
  story,
  canDrag,
  laneId,
  actions,
  sprintLanes,
  workflow,
  caps,
  currentUserId,
  isSelected,
  onSelectStory,
  selectionActive,
  multiDragActive = false,
  members,
  currentUserCanBeAssignee,
}: {
  story: Story;
  canDrag: boolean;
  /** Which lane this row sits in — a sprint id, or BACKLOG_LANE. */
  laneId: string;
  actions: RowActions;
  sprintLanes: Sprint[];
  workflow: WorkflowStatus[];
  caps: RowCaps;
  currentUserId: string | null;
  isSelected: boolean;
  onSelectStory: (id: string, shiftKey: boolean) => void;
  selectionActive: boolean;
  multiDragActive?: boolean;
  members: { id: string; name: string }[];
  currentUserCanBeAssignee: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: story.id,
    data: { type: 'row', story, laneId },
    disabled: !canDrag,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'group/row touch-manipulation',
        canDrag && 'cursor-grab active:cursor-grabbing',
        // The actively-dragged row hides (the DragOverlay represents it) so the
        // sortable gap reads cleanly; other multi-selected rows just dim.
        isDragging && 'opacity-0',
        multiDragActive && !isDragging && 'opacity-30',
        isSelected && !multiDragActive && 'bg-primary/5',
      )}
      {...attributes}
      {...listeners}
    >
      <StoryRowInner
        story={story}
        canDrag={canDrag}
        actions={actions}
        sprintLanes={sprintLanes}
        workflow={workflow}
        caps={caps}
        currentUserId={currentUserId}
        isSelected={isSelected}
        onSelectStory={onSelectStory}
        selectionActive={selectionActive}
        members={members}
        currentUserCanBeAssignee={currentUserCanBeAssignee}
      />
    </li>
  );
});

const StoryRowInner = memo(function StoryRowInner({
  story,
  canDrag,
  dragging,
  actions,
  sprintLanes,
  workflow,
  caps,
  currentUserId,
  isSelected = false,
  onSelectStory,
  selectionActive = false,
  members = [],
  currentUserCanBeAssignee = false,
}: {
  story: Story;
  canDrag: boolean;
  dragging?: boolean;
  actions?: RowActions;
  sprintLanes: Sprint[];
  workflow: WorkflowStatus[];
  caps: RowCaps;
  currentUserId: string | null;
  isSelected?: boolean;
  onSelectStory?: (id: string, shiftKey: boolean) => void;
  selectionActive?: boolean;
  members?: { id: string; name: string }[];
  currentUserCanBeAssignee?: boolean;
}) {
  // The workflow column this story sits in (imported Jira column), for the pill
  // label/color and the "current" marker in the change-status menus.
  const currentRow = resolveStoryRow(story, workflow);
  const statusLabel = currentRow?.label ?? STATUS_LABEL[story.status];
  const onOpen = actions?.onOpen;
  const isMine = currentUserId !== null && story.assignee?.id === currentUserId;
  const otherSprints = sprintLanes.filter((sp) => sp.id !== story.sprintId);
  const inBacklog = story.sprintId == null;
  const isDone = story.status === 'done';
  const pointsLabel =
    typeof story.storyPoints === 'number'
      ? `${story.storyPoints} story point${story.storyPoints === 1 ? '' : 's'}`
      : 'No story points';

  // dnd-kit attaches a pointerdown listener at the row root. Stop propagation
  // on the menu trigger so opening the menu doesn't initiate a drag.
  const stopDnd = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={(e) => {
        // Don't open the side panel when the click bubbled up from a nested
        // interactive control — assignee picker, action menu, checkbox, etc.
        // The Radix DropdownMenu trigger is a real <button>, so closest()
        // catches it; portalled menu items live outside this subtree so they
        // never reach this handler.
        const t = e.target as HTMLElement | null;
        if (t && t.closest('button, input, [role="menu"], [role="menuitem"]')) return;
        // Ctrl/Cmd-click opens the story's full page in a new browser tab;
        // a plain click opens the side panel as before.
        if (e.metaKey || e.ctrlKey) {
          window.open(`/projects/${story.projectId}/stories/${story.key}`, '_blank', 'noopener');
          return;
        }
        onOpen?.(story);
      }}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen(story);
        }
      }}
      data-story-key={story.key}
      title={`${story.key} · ${story.title} · ${pointsLabel}`}
      className={cn(
        'flex h-9 w-full items-center gap-2 px-3 text-sm',
        'transition-colors',
        !dragging && 'hover:bg-accent/50',
        isDone && 'bg-muted/20',
      )}
    >
      {/* Selection checkbox — always visible when something is selected,
          otherwise reveals on row hover. Shift-click extends a range from the
          last clicked checkbox. */}
      {onSelectStory ? (
        <input
          type="checkbox"
          checked={isSelected}
          aria-label={`Select ${story.key}`}
          onPointerDown={stopDnd}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            // Read shiftKey off the underlying click event. Doing all the
            // work in onChange (instead of also wiring onClick) avoids the
            // double-fire that would otherwise un-toggle the last row of a
            // shift-click range — the {1..n-1} bug.
            const shift =
              (e.nativeEvent as MouseEvent | undefined)?.shiftKey ?? false;
            onSelectStory(story.id, shift);
          }}
          className={cn(
            'h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-muted-foreground/40 accent-primary transition-opacity',
            isSelected || selectionActive
              ? 'opacity-100'
              : 'opacity-0 group-hover/row:opacity-100',
          )}
        />
      ) : null}

      {/* Drag handle */}
      <span
        aria-hidden
        className={cn(
          'text-muted-foreground/40 transition-opacity',
          canDrag ? 'opacity-0 group-hover/row:opacity-100' : 'opacity-0',
        )}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* Type icon */}
      <StoryTypeIcon type={story.type} />

      {/* Key — a real link to the full-page ticket: right-click → "Open in new
          tab", underlines on hover. stopPropagation keeps a click off the row's
          open handler and a press off the drag sensor. */}
      <Link
        to={`/projects/${story.projectId}/stories/${story.key}`}
        onPointerDown={stopDnd}
        onClick={(e) => e.stopPropagation()}
        title={`Open ${story.key} (right-click to open in a new tab)`}
        className={cn(
          'font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline',
          isDone && 'line-through opacity-70',
        )}
      >
        {story.key}
      </Link>

      {/* Title + labels (epic chip now lives on the right, before priority) */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            'truncate font-medium text-foreground',
            isDone && 'line-through text-muted-foreground decoration-muted-foreground/60',
          )}
        >
          {story.title}
        </span>
        <LabelBadges labels={story.labels} max={3} />
        {actions && caps.canEdit && !dragging ? (
          <LabelEditPopover story={story} projectId={story.projectId}>
            <button
              type="button"
              onPointerDown={stopDnd}
              onClick={stopDnd}
              onKeyDown={(e) => e.stopPropagation()}
              // Reveals only when the cursor is exactly over this (invisible-at-
              // rest) button — `hover:opacity-100` on the button itself, NOT a
              // whole-row group-hover. Shown on every editable row (labeled or not).
              className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-sm border border-dashed border-muted-foreground/40 px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:border-primary/50 hover:text-foreground hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Edit labels for ${story.key}`}
              title="Add or edit labels"
            >
              <Tags className="h-3 w-3" />
            </button>
          </LabelEditPopover>
        ) : null}
      </div>

      {/* Child-issue indicator — shown when the ticket has subtasks. `_count`
          is hydrated by the list endpoint (storyModel.list). Matches the board
          card's ListTree icon so the affordance reads the same everywhere. */}
      {(story._count?.subtasks ?? 0) > 0 ? (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"
          title={`${story._count?.subtasks} child issue${story._count?.subtasks === 1 ? '' : 's'}`}
          aria-label={`${story._count?.subtasks} child issue${story._count?.subtasks === 1 ? '' : 's'}`}
        >
          <ListTree className="h-3.5 w-3.5" aria-hidden />
          {story._count?.subtasks}
        </span>
      ) : null}

      {/* Epic — pushed to the right, just before the priority indicator (Jira). */}
      {story.epic ? <EpicChip epic={story.epic} className="max-w-[140px]" /> : null}

      {/* Priority */}
      <PriorityBadge priority={story.priority} />

      {/* Status pill — clickable when the user can change status, opens a
          Jira-style picker right on the row. Falls back to read-only pill. */}
      {actions && caps.canChangeStatus && !dragging ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            onPointerDown={stopDnd}
            onClick={stopDnd}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="rounded ring-offset-1 hover:ring-2 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label={`Change status for ${story.key} (currently ${statusLabel})`}
              title={`Status: ${statusLabel} — click to change`}
            >
              <StoryStatusPill story={story} workflow={workflow} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuLabel>Change status</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workflow.map((w) => {
              const isCurrent = currentRow?.id === w.id;
              return (
                <DropdownMenuItem
                  key={w.id}
                  disabled={isCurrent}
                  onSelect={() => actions.onChangeStatus(story, w.id)}
                  className="flex items-center gap-2"
                >
                  <WorkflowPill row={w} />
                  {isCurrent ? (
                    <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <StoryStatusPill story={story} workflow={workflow} />
      )}

      {/* Story points */}
      {typeof story.storyPoints === 'number' ? (
        <span
          className={cn(
            'inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-[11px] font-semibold text-foreground',
            isDone && 'opacity-60',
          )}
          title={`Story points: ${story.storyPoints}`}
          aria-label={`${story.storyPoints} story point${story.storyPoints === 1 ? '' : 's'}`}
        >
          {story.storyPoints}
        </span>
      ) : (
        <span
          className="inline-block h-5 w-5"
          aria-hidden
          title="No story points"
        />
      )}

      {/* Assignee — clickable when the user can reassign, opens an inline
          Jira-style picker (members + Assign to me + Unassign) without
          navigating to the story detail. */}
      {actions && caps.canAssign && !dragging ? (
        <UserPicker
          value={story.assignee?.id ?? null}
          onChange={(id) => (id ? actions.onAssign(story, id) : actions.onUnassign(story))}
          allowUnassign
          align="end"
          options={members.map((m) => ({ id: m.id, name: m.name }))}
          currentUserId={currentUserCanBeAssignee ? currentUserId : null}
          trigger={
            <button
              type="button"
              onPointerDown={stopDnd}
              onClick={stopDnd}
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

      {/* Row actions menu */}
      {actions && !dragging ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            onPointerDown={stopDnd}
            onClick={stopDnd}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={cn(
                'rounded p-0.5 text-muted-foreground/60 transition-opacity',
                'opacity-0 group-hover/row:opacity-100 hover:bg-muted hover:text-foreground',
                'data-[state=open]:opacity-100 data-[state=open]:bg-muted',
                'focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-primary/40',
              )}
              aria-label={`Actions for ${story.key}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuLabel>{story.key}</DropdownMenuLabel>

            <DropdownMenuItem onSelect={() => actions.onOpen(story)}>
              <ExternalLink className="!text-sky-600" />
              Open issue
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onCopyKey(story)}>
              <Copy className="!text-violet-600" />
              Copy issue key
            </DropdownMenuItem>

            {caps.canAssign ? (
              <>
                <DropdownMenuSeparator />
                {!isMine && currentUserId && currentUserCanBeAssignee ? (
                  <DropdownMenuItem onSelect={() => actions.onAssignToMe(story)}>
                    <UserPlus className="!text-emerald-600" />
                    Assign to me
                  </DropdownMenuItem>
                ) : null}
                {story.assignee ? (
                  <DropdownMenuItem onSelect={() => actions.onUnassign(story)}>
                    <UserX className="!text-amber-600" />
                    Unassign
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}

            {caps.canMove ? (
              <>
                <DropdownMenuSeparator />
                {!inBacklog ? (
                  <DropdownMenuItem onSelect={() => actions.onMoveToBacklog(story)}>
                    <ArrowDownToLine className="!text-sky-600" />
                    Move to backlog
                  </DropdownMenuItem>
                ) : null}
                {otherSprints.length > 0 ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <ArrowRightLeft className="!text-sky-600" />
                      Move to sprint
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {otherSprints.map((sp) => (
                        <DropdownMenuItem
                          key={sp.id}
                          onSelect={() => actions.onMoveToSprint(story, sp.id)}
                        >
                          {sp.status === 'active' ? (
                            <CheckCircle2 className="!text-emerald-600" />
                          ) : (
                            <CircleDashed className="!text-amber-600" />
                          )}
                          <span className="flex-1 truncate">{sp.name}</span>
                          {sp.status === 'active' ? (
                            <span className="ml-2 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              live
                            </span>
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
              </>
            ) : null}

            {caps.canChangeStatus ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CircleDashed className="!text-amber-600" />
                    Change status
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {workflow.map((w) => {
                      const isCurrent = currentRow?.id === w.id;
                      return (
                        <DropdownMenuItem
                          key={w.id}
                          disabled={isCurrent}
                          onSelect={() => actions.onChangeStatus(story, w.id)}
                        >
                          <WorkflowPill row={w} />
                          {isCurrent ? (
                            <span className="ml-auto text-[10px] text-muted-foreground">current</span>
                          ) : null}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : null}

            {caps.canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => actions.onDelete(story)}
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <Trash2 className="!text-red-600" />
                  Delete issue
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="inline-block h-5 w-5" aria-hidden />
      )}
    </div>
  );
});

// ── Status pill ────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: StoryStatus }) {
  const cls = {
    todo: 'bg-muted text-foreground/80',
    in_progress: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    in_review: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    qa: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  }[status];
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wider',
        cls,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Filter select ──────────────────────────────────────────────────────────

const FILTER_ALL = '__all__';

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Select
        value={value === '' ? FILTER_ALL : value}
        onValueChange={(v) => onChange(v === FILTER_ALL ? '' : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || FILTER_ALL} value={o.value || FILTER_ALL}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
