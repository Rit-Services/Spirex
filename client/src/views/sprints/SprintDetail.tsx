// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { sprintApi, type SprintDetailResponse } from '@/apis/sprintApi';
import { storyApi } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import { useAppDispatch, useAppSelector } from '@/store';
import { setCurrentProject, fetchProjectsThunk, fetchMembersThunk } from '@/store/projectSlice';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { EmptyState } from '@/components/EmptyState';
import { StoryCard } from '@/components/scrum/StoryCard';
import { useProjectStatuses } from '@/hooks/useProjectStatuses';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useStoryListShortcuts } from '@/hooks/useStoryListShortcuts';
import { type Priority, type Story, type StoryStatus, type StoryType } from '@/types/scrum';
import { boardScrolls, boardRowClass, columnWidthClass } from '@/components/scrum/boardLayout';
import { cn } from '@/lib/utils';
import { Filter as FilterIcon, RotateCcw, Search, X } from 'lucide-react';
import { toast } from 'sonner';

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

const FILTER_ALL = '__all__';

export function SprintDetail() {
  const { id: projectId, sprintId } = useParams<{ id: string; sprintId: string }>();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);
  const epics = useAppSelector((s) => (projectId ? s.epics.byProject[projectId] ?? [] : []));
  const members = useAppSelector((s) => s.projects.currentMembers);
  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, name: m.user.name })),
    [members],
  );
  const project = projects.find((p) => p.id === projectId) ?? null;
  const { canInProject } = useCurrentProject();

  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<SprintDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Use the RAW, uncollapsed workflow rows so columns sharing a coreStatus
  // (e.g. two `in_progress` columns) render as distinct columns — matching the
  // active sprint board.
  const { rows: workflowRows } = useProjectStatuses(projectId);
  const columns = workflowRows;
  const [reiterating, setReiterating] = useState<string | null>(null);

  // ── Filter state (URL-driven, matches Backlog conventions) ──────────
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = params.get('q') ?? '';
  const epicFilter = params.get('epic') ?? '';
  const priorityFilter = (params.get('priority') as Priority | null) ?? '';
  const typeFilter = (params.get('type') as StoryType | null) ?? '';
  const assigneeFilter = params.get('assignee') ?? '';
  const activeFilterCount =
    [epicFilter, priorityFilter, typeFilter, assigneeFilter].filter(Boolean).length;
  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };
  const clearFilters = () => {
    const p = new URLSearchParams(params);
    ['q', 'epic', 'priority', 'type', 'assignee'].forEach((k) => p.delete(k));
    setParams(p, { replace: true });
  };
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const onReiterate = async (story: Story) => {
    setReiterating(story.id);
    try {
      const created = await storyApi.reiterate(story.id);
      toast.success(`Re-iterated as ${created.key} — sent to backlog and linked to ${story.key}`);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setReiterating(null);
    }
  };

  const isCompleted = data?.sprint.status === 'completed';
  const canReiterate = isCompleted && canInProject('story:create');

  useEffect(() => {
    if (!projectId) return;
    dispatch(setCurrentProject(projectId));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchEpicsThunk(projectId));
    void dispatch(fetchMembersThunk(projectId));
  }, [dispatch, projectId, projects.length]);

  useEffect(() => {
    if (!sprintId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const detail = await sprintApi.getDetail(sprintId);
        if (!cancelled) setData(detail);
      } catch (err) {
        if (!cancelled) toast.error(extractError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sprintId]);

  // ── Client-side filtering ──────────────────────────────────────────
  const allStories = data?.stories ?? [];
  const filteredStories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allStories.filter((s) => {
      if (q) {
        const matches =
          s.title.toLowerCase().includes(q) || s.key.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (epicFilter === 'null') {
        if (s.epic) return false;
      } else if (epicFilter && s.epic?.id !== epicFilter) {
        return false;
      }
      if (priorityFilter && s.priority !== priorityFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      if (assigneeFilter && (s.assignee?.id ?? '') !== assigneeFilter) return false;
      return true;
    });
  }, [allStories, search, epicFilter, priorityFilter, typeFilter, assigneeFilter]);

  // Bucket stories by their ACTUAL workflow column (statusId), exactly like the
  // active board — not by collapsed core status. Backlog has no column, so it
  // gets its own list. statusId null/stale falls back to the first column that
  // matches the story's core status.
  const grouped = useMemo(() => {
    const byRow: Record<string, Story[]> = {};
    for (const col of columns) byRow[col.id] = [];
    const firstRowForCore = (core: StoryStatus) =>
      columns.find((c) => c.coreStatus === core);
    for (const s of filteredStories) {
      const rowId =
        s.statusId && byRow[s.statusId] !== undefined
          ? s.statusId
          : firstRowForCore(s.status)?.id;
      if (rowId && byRow[rowId]) byRow[rowId].push(s);
    }
    return { byRow };
  }, [filteredStories, columns]);

  // A completed sprint only retains done-status work (completion moved the rest
  // out), so hide the empty non-done columns. Defensive: still show ANY column
  // that holds a ticket, so a stray non-done story is never hidden.
  const visibleColumns = useMemo(() => {
    if (!isCompleted) return columns;
    return columns.filter(
      (c) => c.coreStatus === 'done' || (grouped.byRow[c.id]?.length ?? 0) > 0,
    );
  }, [isCompleted, columns, grouped]);
  const columnsScroll = boardScrolls(visibleColumns.length);

  // `/` focuses the search box, `f` toggles the filter panel. Selection
  // shortcuts (Esc, Ctrl+A, Delete, shift-click) are Backlog-only.
  useStoryListShortcuts({
    searchInputRef,
    toggleFilters: () => setFiltersOpen((v) => !v),
    hasSelection: false,
    clearSelection: () => {},
  });

  if (!projectId || !sprintId) return null;

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground">Loading sprint…</p>;
  }
  if (!data) {
    return (
      <EmptyState
        title="Sprint not found"
        description="This sprint may have been deleted or you don't have access."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${projectId}/sprints`}>← Sprints</Link>
          </Button>
        }
      />
    );
  }

  const { sprint, report } = data;
  const total = allStories.length;
  const visibleTotal = filteredStories.length;
  const doneCount = allStories.filter((s) => s.status === 'done').length;
  const pct = report.committedPoints === 0
    ? 0
    : Math.round((report.completedPoints / report.committedPoints) * 100);

  const openStory = (storyKey: string) => {
    setParams((prev) => {
      prev.set('story', storyKey);
      return prev;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${projectId}/sprints`}>← Back to sprints</Link>
        </Button>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              {project?.name ? `${project.name} — ${sprint.name}` : sprint.name}
              <Badge
                variant={
                  sprint.status === 'active'
                    ? 'default'
                    : sprint.status === 'completed'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {sprint.status}
              </Badge>
            </h1>
            {sprint.goal ? (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{sprint.goal}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {fmt(sprint.startDate)} → {fmt(sprint.endDate)}
              {sprint.completedAt ? ` · completed ${fmt(sprint.completedAt)}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="animate-slide-up motion-reduce:animate-none">
          <CardHeader className="pb-2">
            <CardDescription>Stories</CardDescription>
            <CardTitle className="text-2xl">{total}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {doneCount} done · {total - doneCount} incomplete
          </CardContent>
        </Card>
        <Card
          className="animate-slide-up motion-reduce:animate-none"
          style={{ animationDelay: '55ms' }}
        >
          <CardHeader className="pb-2">
            <CardDescription>Committed</CardDescription>
            <CardTitle className="text-2xl">{report.committedPoints} pts</CardTitle>
          </CardHeader>
        </Card>
        <Card
          className="animate-slide-up motion-reduce:animate-none"
          style={{ animationDelay: '110ms' }}
        >
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">{report.completedPoints} pts</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">{pct}% of committed</CardContent>
        </Card>
        <Card
          className="animate-slide-up motion-reduce:animate-none"
          style={{ animationDelay: '165ms' }}
        >
          <CardHeader className="pb-2">
            <CardDescription>Incomplete at close</CardDescription>
            <CardTitle className="text-2xl">{report.incompleteCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {report.incompleteKeys.length > 0 ? report.incompleteKeys.join(', ') : '—'}
          </CardContent>
        </Card>
      </div>

      {/* ── Search + Filter toolbar ─────────────────────────────────── */}
      {total > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                aria-label="Search sprint"
                placeholder="Search this sprint  ( / )"
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
            <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-4">
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

      {total === 0 ? (
        <EmptyState title="No stories on this sprint" description="Nothing to show." />
      ) : visibleTotal === 0 ? (
        <EmptyState title="No matches" description="No stories match the current filters." />
      ) : (
        <div className="space-y-3">
          {/* Bounded-height board: the row is capped to ~viewport height and
              items-stretch makes every column that same height (uniform, like
              the active Board). Each column's body then scrolls INTERNALLY
              instead of stretching the whole page. */}
          <div
            className={cn(
              'flex max-h-[calc(100vh-8rem)] animate-slide-up gap-3 motion-reduce:animate-none',
              boardRowClass(columnsScroll),
            )}
            style={{ animationDelay: '220ms' }}
          >
            {visibleColumns.map((col) => {
              const colStories = grouped.byRow[col.id] ?? [];
              return (
                <Card
                  key={col.id}
                  className={cn(
                    'flex min-h-0 flex-col overflow-hidden',
                    columnWidthClass(columnsScroll),
                  )}
                >
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: col.color }}
                    >
                      {col.label} · {colStories.length}
                    </CardTitle>
                  </CardHeader>
                  {/* `min-h-0 flex-1 overflow-y-auto` — claims the height left
                      after the header and scrolls cards here, not the page. */}
                  <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {colStories.length === 0 ? (
                      <p className="text-xs italic text-muted-foreground">—</p>
                    ) : (
                      colStories.map((s) => (
                        <StoryRow
                          key={s.id}
                          story={s}
                          onOpen={() => openStory(s.key)}
                          canReiterate={canReiterate && col.coreStatus === 'done'}
                          reiterating={reiterating === s.id}
                          onReiterate={() => onReiterate(s)}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface StoryRowProps {
  story: Story;
  onOpen: () => void;
  canReiterate: boolean;
  reiterating: boolean;
  onReiterate: () => void;
}

function StoryRow({ story, onOpen, canReiterate, reiterating, onReiterate }: StoryRowProps) {
  return (
    <div className="relative">
      <StoryCard story={story} onOpen={onOpen} />
      {canReiterate ? (
        <Button
          size="sm"
          variant="outline"
          className="absolute right-2 top-2 h-7 gap-1 px-2 text-[11px]"
          disabled={reiterating}
          onClick={(e) => {
            e.stopPropagation();
            onReiterate();
          }}
          title="Clone this story to the backlog and link it back to the original"
        >
          <RotateCcw className="h-3 w-3" />
          {reiterating ? 'Re-iterating…' : 'Re-iterate'}
        </Button>
      ) : null}
    </div>
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
