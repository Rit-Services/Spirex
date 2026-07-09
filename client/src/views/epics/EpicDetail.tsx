// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchMembersThunk } from '@/store/projectSlice';
import { epicApi } from '@/apis/epicApi';
import { storyApi } from '@/apis/storyApi';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BoardCard } from '@/components/scrum/BoardCard';
import { MarkdownView } from '@/components/scrum/MarkdownView';
import { EpicDialog } from '@/components/scrum/EpicDialog';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useProjectStatuses } from '@/hooks/useProjectStatuses';
import { boardScrolls, boardRowClass, columnWidthClass } from '@/components/scrum/boardLayout';
import { useStoryListShortcuts } from '@/hooks/useStoryListShortcuts';
import type { Epic, Priority, Story, StoryStatus, StoryType } from '@/types/scrum';
import { cn } from '@/lib/utils';
import { Filter as FilterIcon, Search, X } from 'lucide-react';
import { toast } from 'sonner';

const FILTER_ALL = '__all__';

// A board column on the epic view — one per workflow row.
interface EpicBoardCol {
  id: string;
  coreStatus: StoryStatus;
  label: string;
  color: string;
}

export function EpicDetail() {
  const { id, epicId } = useParams<{ id: string; epicId: string }>();
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const epics = useAppSelector((s) => (id ? s.epics.byProject[id] ?? [] : []));
  const cached = epics.find((e) => e.id === epicId) ?? null;
  const [epic, setEpic] = useState<Epic | null>(cached);
  const [editing, setEditing] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const members = useAppSelector((s) => s.projects.currentMembers);
  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, name: m.user.name })),
    [members],
  );
  const { user } = useAuth();
  const { canInProject } = useCurrentProject();
  // Build the board columns from the RAW workflow rows (so columns sharing a
  // coreStatus stay distinct). Stories bucket by statusId, like the board.
  const { rows: workflowRows } = useProjectStatuses(id);
  const columns = useMemo<EpicBoardCol[]>(
    () =>
      workflowRows.map((r) => ({
        id: r.id,
        coreStatus: r.coreStatus,
        label: r.label,
        color: r.color,
      })),
    [workflowRows],
  );
  const columnsScroll = boardScrolls(columns.length);
  const canAssign = canInProject('story:assign');
  const isCurrentUserMember = !!user?.id && memberOptions.some((m) => m.id === user.id);

  // ── Filter state ────────────────────────────────────────────────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = params.get('q') ?? '';
  const priorityFilter = (params.get('priority') as Priority | null) ?? '';
  const typeFilter = (params.get('type') as StoryType | null) ?? '';
  const assigneeFilter = params.get('assignee') ?? '';
  const activeFilterCount =
    [priorityFilter, typeFilter, assigneeFilter].filter(Boolean).length;
  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };
  const clearFilters = () => {
    const p = new URLSearchParams(params);
    ['q', 'priority', 'type', 'assignee'].forEach((k) => p.delete(k));
    setParams(p, { replace: true });
  };
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (id && epics.length === 0) void dispatch(fetchEpicsThunk(id));
  }, [dispatch, id, epics.length]);

  useEffect(() => {
    if (id) void dispatch(fetchMembersThunk(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (!epicId) return;
    void epicApi.get(epicId).then(setEpic);
  }, [epicId]);

  const onAssignFromCard = async (story: Story, assigneeId: string | null) => {
    if ((story.assignee?.id ?? null) === assigneeId) return;
    try {
      const updated = await storyApi.update(story.id, { assigneeId });
      setEpic((prev) =>
        prev
          ? {
              ...prev,
              stories: (prev.stories ?? []).map((s) =>
                s.id === updated.id ? { ...s, ...updated } : s,
              ),
            }
          : prev,
      );
      toast.success(
        assigneeId
          ? `${story.key} assigned to ${memberOptions.find((m) => m.id === assigneeId)?.name ?? 'member'}`
          : `${story.key} unassigned`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not change assignee';
      toast.error(msg);
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const collisionDetection: CollisionDetection = (args) => {
    const over = pointerWithin(args);
    return over.length > 0 ? over : closestCenter(args);
  };

  // ── Client-side filtering ──────────────────────────────────────────
  const allStories: Story[] = epic?.stories ?? [];
  const filteredStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStories.filter((s) => {
      if (q) {
        const matches =
          s.title.toLowerCase().includes(q) || s.key.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (priorityFilter && s.priority !== priorityFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      if (assigneeFilter && (s.assignee?.id ?? '') !== assigneeFilter) return false;
      return true;
    });
  }, [allStories, search, priorityFilter, typeFilter, assigneeFilter]);

  // Bucket by the story's actual column (statusId); backlog stories go to the
  // synthetic backlog column; null/stale statusId falls back to the first column
  // matching the core status.
  const grouped = useMemo(() => {
    const byCol: Record<string, Story[]> = {};
    for (const c of columns) byCol[c.id] = [];
    const firstRowForCore = (core: StoryStatus) =>
      columns.find((c) => c.coreStatus === core);
    for (const s of filteredStories) {
      const colId =
        s.statusId && byCol[s.statusId] !== undefined
          ? s.statusId
          : firstRowForCore(s.status)?.id;
      if (colId && byCol[colId]) byCol[colId].push(s);
    }
    return byCol;
  }, [filteredStories, columns]);

  // `/` focuses search, `f` toggles filter panel. Selection shortcuts are
  // Backlog-only.
  useStoryListShortcuts({
    searchInputRef,
    toggleFilters: () => setFiltersOpen((v) => !v),
    hasSelection: false,
    clearSelection: () => {},
  });

  if (!id || !epicId || !epic) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const total = allStories.length;
  const visibleTotal = filteredStories.length;
  const done = allStories.filter((s) => s.status === 'done').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const onDragStart = (e: DragStartEvent) => {
    const story = e.active.data.current?.story as Story | undefined;
    setActiveStory(story ?? null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveStory(null);
    if (!event.over || !epic) return;
    const story = event.active.data.current?.story as Story | undefined;
    const target = event.over.data.current as
      | { colId: string; coreStatus: StoryStatus }
      | undefined;
    if (!story || !target) return;
    // No-op if the card is already in this exact column.
    if (story.statusId === target.colId) return;

    if (!canInProject('story:status')) {
      toast.error("You don't have permission to move stories");
      return;
    }

    const previousStories = epic.stories ?? [];
    const optimistic = previousStories.map((s) =>
      s.id === story.id
        ? { ...s, status: target.coreStatus, statusId: target.colId }
        : s,
    );
    setEpic({ ...epic, stories: optimistic });

    try {
      // Target the specific workflow column by id.
      const updated = await storyApi.changeStatusRow(story.id, target.colId);
      setEpic((prev) =>
        prev
          ? {
              ...prev,
              stories: (prev.stories ?? []).map((s) =>
                s.id === updated.id ? { ...s, ...updated } : s,
              ),
            }
          : prev,
      );
    } catch (err) {
      setEpic((prev) => (prev ? { ...prev, stories: previousStories } : prev));
      const msg = err instanceof Error ? err.message : 'Could not move card — reverted';
      toast.error(msg);
    }
  };

  const openStory = (st: Story) =>
    setParams((prev) => {
      prev.set('story', st.key);
      return prev;
    });

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${id}/epics`}>← All epics</Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="h-1.5 w-full" style={{ backgroundColor: epic.color }} />
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span
                className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white"
                style={{ backgroundColor: epic.color }}
              >
                {epic.key}
              </span>
              <h1 className="text-2xl font-semibold">{epic.title}</h1>
              <Badge variant="secondary">{epic.status.replace('_', ' ')}</Badge>
            </div>
            <div className="mt-3 max-w-2xl">
              <MarkdownView value={epic.description} />
            </div>
          </div>
          {canInProject('epic:edit') ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
        <div className="border-t bg-muted/40 px-5 py-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>
              {done}/{total} done · {pct}%
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: epic.color }}
            />
          </div>
        </div>
      </div>

      {/* ── Search + Filter toolbar ─────────────────────────────────── */}
      {total > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                aria-label="Search epic stories"
                placeholder="Search this epic  ( / )"
                value={search}
                onChange={(e) => setFilter('q', e.target.value)}
                className="h-8 pl-7 text-sm"
              />
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
            {(activeFilterCount > 0 || search) ? (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs">
                <X className="h-3 w-3" />
                Clear
              </Button>
            ) : null}
            {visibleTotal !== total ? (
              <span className="text-xs text-muted-foreground">
                Showing {visibleTotal} of {total}
              </span>
            ) : null}
          </div>

          {filtersOpen ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
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
                label="Assignee"
                value={assigneeFilter}
                onChange={(v) => setFilter('assignee', v)}
                options={[
                  { value: '', label: 'Anyone' },
                  ...memberOptions.map((m) => ({ value: m.id, label: m.name })),
                ]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        {/* Bounded-height board: row capped to ~viewport so columns are uniform
            height and each column's cards scroll INTERNALLY, not the whole page
            — same UX as the sprint board. */}
        <div className={cn('flex max-h-[calc(100vh-8rem)] gap-4', boardRowClass(columnsScroll))}>
          {columns.map((col) => (
            <EpicDropColumn
              key={col.id}
              column={col}
              fixedWidth={columnsScroll}
              stories={grouped[col.id] ?? []}
              onOpenStory={openStory}
              dropDisabled={!canInProject('story:status')}
              members={memberOptions}
              currentUserId={user?.id ?? null}
              currentUserCanBeAssignee={isCurrentUserMember}
              canAssign={canAssign}
              onAssign={onAssignFromCard}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeStory ? <BoardCard story={activeStory} onOpen={() => {}} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <EpicDialog open={editing} onOpenChange={setEditing} projectId={id} epic={epic} />
    </div>
  );
}

interface EpicDropColumnProps {
  column: EpicBoardCol;
  fixedWidth?: boolean;
  stories: Story[];
  onOpenStory: (s: Story) => void;
  dropDisabled?: boolean;
  members?: { id: string; name: string }[];
  currentUserId?: string | null;
  currentUserCanBeAssignee?: boolean;
  canAssign?: boolean;
  onAssign?: (story: Story, assigneeId: string | null) => void;
}

function EpicDropColumn({
  column,
  fixedWidth = false,
  stories,
  onOpenStory,
  dropDisabled,
  members,
  currentUserId,
  currentUserCanBeAssignee,
  canAssign,
  onAssign,
}: EpicDropColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `epic-col:${column.id}`,
    data: { colId: column.id, coreStatus: column.coreStatus },
    disabled: dropDisabled,
  });

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        'flex min-h-0 flex-col overflow-hidden transition-colors',
        columnWidthClass(fixedWidth),
        isOver && 'border-primary bg-primary/5',
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium" style={{ color: column.color }}>
          {column.label} · {stories.length}
        </CardTitle>
      </CardHeader>
      {/* `min-h-0 flex-1 overflow-y-auto` — cards scroll here, not the page. */}
      <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {stories.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-xs italic text-muted-foreground">
            Drop here
          </div>
        ) : (
          stories.map((s) => (
            <BoardCard
              key={s.id}
              story={s}
              onOpen={onOpenStory}
              disabled={dropDisabled}
              members={members}
              currentUserId={currentUserId}
              currentUserCanBeAssignee={currentUserCanBeAssignee}
              canAssign={canAssign}
              onAssign={onAssign}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={value === '' ? FILTER_ALL : value}
        onValueChange={(v) => onChange(v === FILTER_ALL ? '' : v)}
      >
        <SelectTrigger className="h-9">
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
