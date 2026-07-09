// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search as SearchIcon,
  FileText,
  Layers,
  FolderKanban,
  MessageSquare,
  X,
  Bug,
  CheckSquare,
  SlidersHorizontal,
  User as UserIcon,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { searchThunk, clearResults } from '@/store/searchSlice';
import { fetchUserDirectoryThunk } from '@/store/userSlice';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SearchHit, SearchType } from '@/types/search';
import type { StoryStatus, StoryType, Priority } from '@/types/scrum';
import { STORY_STATUS_LABEL, PRIORITY_LABEL } from '@/types/scrum';
import { cn } from '@/lib/utils';

const TYPE_OPTIONS: { value: SearchType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'story', label: 'Stories' },
  { value: 'epic', label: 'Epics' },
  { value: 'project', label: 'Projects' },
  { value: 'comment', label: 'Comments' },
];

const STATUS_OPTIONS: { value: StoryStatus | ''; label: string }[] = [
  { value: '',            label: 'Any status' },
  { value: 'todo',        label: STORY_STATUS_LABEL.todo },
  { value: 'in_progress', label: STORY_STATUS_LABEL.in_progress },
  { value: 'in_review',   label: STORY_STATUS_LABEL.in_review },
  { value: 'qa',          label: STORY_STATUS_LABEL.qa },
  { value: 'done',        label: STORY_STATUS_LABEL.done },
];

const STORY_TYPE_OPTIONS: { value: StoryType | ''; label: string }[] = [
  { value: '',      label: 'Any type' },
  { value: 'story', label: 'Story' },
  { value: 'bug',   label: 'Bug' },
  { value: 'task',  label: 'Task' },
];

const TYPE_ICON: Record<SearchType, React.ReactNode> = {
  story:   <FileText      className="h-4 w-4" />,
  epic:    <Layers        className="h-4 w-4" />,
  project: <FolderKanban  className="h-4 w-4" />,
  comment: <MessageSquare className="h-4 w-4" />,
};

const TYPE_ACCENT: Record<SearchType, { border: string; bg: string; text: string; chip: string }> = {
  story:   { border: 'border-l-blue-500',   bg: 'bg-blue-500/10',   text: 'text-blue-500',   chip: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  epic:    { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-500', chip: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  project: { border: 'border-l-emerald-500',bg: 'bg-emerald-500/10',text: 'text-emerald-500',chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  comment: { border: 'border-l-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-500',  chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

const STATUS_COLOR: Record<StoryStatus, string> = {
  todo:        '#64748B',
  in_progress: '#3B82F6',
  in_review:   '#8B5CF6',
  qa:          '#F59E0B',
  done:        '#10B981',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low:      '#10B981',
  medium:   '#3B82F6',
  high:     '#F59E0B',
  critical: '#EF4444',
};

const STORY_TYPE_ICON: Record<StoryType, { icon: React.ReactNode; color: string }> = {
  story: { icon: <FileText   className="h-3.5 w-3.5" />, color: '#3B82F6' },
  bug:   { icon: <Bug        className="h-3.5 w-3.5" />, color: '#EF4444' },
  task:  { icon: <CheckSquare className="h-3.5 w-3.5" />, color: '#10B981' },
};

function hitUrl(hit: SearchHit): string {
  switch (hit.type) {
    case 'story':   return `/projects/${hit.projectId}/backlog?story=${hit.key}`;
    case 'epic':    return `/projects/${hit.projectId}/epics/${hit.id}`;
    case 'project': return `/projects/${hit.projectId}`;
    case 'comment': return `/projects/${hit.projectId}/backlog?story=${hit.storyKey}`;
  }
}

function SnippetHtml({ html }: { html: string }) {
  return (
    <p
      className="mt-1 line-clamp-2 text-sm text-muted-foreground [&_b]:rounded [&_b]:bg-yellow-400/20 [&_b]:px-0.5 [&_b]:font-semibold [&_b]:text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const known = (status as StoryStatus) in STATUS_COLOR;
  const color = known ? STATUS_COLOR[status as StoryStatus] : '#64748B';
  const label = known ? STORY_STATUS_LABEL[status as StoryStatus] : status;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{
        color,
        backgroundColor: `${color}1A`,
        borderColor: `${color}40`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const known = (priority as Priority) in PRIORITY_COLOR;
  if (!known) return null;
  const color = PRIORITY_COLOR[priority as Priority];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      {PRIORITY_LABEL[priority as Priority]}
    </span>
  );
}

function HitCard({ hit, index = 0 }: { hit: SearchHit; index?: number }) {
  const accent = TYPE_ACCENT[hit.type];
  return (
    <Link
      to={hitUrl(hit)}
      className="block animate-slide-up motion-reduce:animate-none"
      // Cascade results as they land. Cap the index so a long result set
      // doesn't make the last cards wait — 40ms keeps it snappy.
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div
        className={cn(
          'group rounded-lg border border-l-4 bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
          accent.border,
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              accent.bg,
              accent.text,
            )}
          >
            {TYPE_ICON[hit.type]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {hit.key ? (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
                  {hit.key}
                </span>
              ) : null}
              <span className="truncate font-medium group-hover:text-primary">{hit.title}</span>
              {/* Where the query actually hit — only worth showing when it's NOT
                  the title/name (that's the obvious default); a "comment" or
                  "acceptance criteria" badge explains why this ranked lower. */}
              {hit.matchedIn && hit.matchedIn !== 'title' && hit.matchedIn !== 'name' ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  in {hit.matchedIn}
                </span>
              ) : null}
              <Badge variant="outline" className={cn('ml-auto text-[10px]', accent.chip)}>
                {hit.projectKey}
              </Badge>
            </div>
            {hit.snippet ? <SnippetHtml html={hit.snippet} /> : null}
            {hit.status || hit.priority ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {hit.status ? <StatusPill status={hit.status} /> : null}
                {hit.priority ? <PriorityPill priority={hit.priority} /> : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function Search() {
  const dispatch = useAppDispatch();
  const [params, setParams] = useSearchParams();
  const { results, loading, lastQuery } = useAppSelector((s) => s.search);

  const qParam = params.get('q') ?? '';
  const typeParam = (params.get('type') ?? '') as SearchType | '';
  const projectParam = params.get('projectId') ?? '';
  const statusParam = (params.get('status') ?? '') as StoryStatus | '';
  const storyTypeParam = (params.get('storyType') ?? '') as StoryType | '';
  const assigneeParam = params.get('assigneeId') ?? '';
  const reporterParam = params.get('reporterId') ?? '';

  const [localQ, setLocalQ] = useState(qParam);
  const projects = useAppSelector((s) => s.projects.list);
  const directory = useAppSelector((s) => s.users.directory);

  // Quick filter for the project rail — sorted A–Z, filtered by name/key, so a
  // long project list is selectable without scrolling.
  const [projectQuery, setProjectQuery] = useState('');
  const visibleProjects = (() => {
    const sorted = [...projects].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    const needle = projectQuery.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle),
    );
  })();

  useEffect(() => {
    if (directory.length === 0) void dispatch(fetchUserDirectoryThunk());
  }, [dispatch, directory.length]);

  const activeFilterCount =
    (typeParam ? 1 : 0) +
    (projectParam ? 1 : 0) +
    (statusParam ? 1 : 0) +
    (storyTypeParam ? 1 : 0) +
    (assigneeParam ? 1 : 0) +
    (reporterParam ? 1 : 0);

  const hasQuery = qParam.trim().length >= 2;
  const canSearch = hasQuery || activeFilterCount > 0;

  useEffect(() => {
    if (canSearch) {
      void dispatch(
        searchThunk({
          q: hasQuery ? qParam : '',
          type: typeParam || undefined,
          projectId: projectParam || undefined,
          status: statusParam || undefined,
          storyType: storyTypeParam || undefined,
          assigneeId: assigneeParam || undefined,
          reporterId: reporterParam || undefined,
        }),
      );
    } else {
      dispatch(clearResults());
    }
  }, [
    dispatch, canSearch, hasQuery,
    qParam, typeParam, projectParam,
    statusParam, storyTypeParam, assigneeParam, reporterParam,
  ]);

  const applyQ = () => {
    const p = new URLSearchParams(params);
    const trimmed = localQ.trim();
    if (trimmed.length >= 2) p.set('q', trimmed);
    else p.delete('q');
    setParams(p);
  };

  const setFilter = (key: string, val: string) => {
    const p = new URLSearchParams(params);
    if (val) p.set(key, val);
    else p.delete(key);
    setParams(p);
  };

  const clearAllFilters = () => {
    const p = new URLSearchParams();
    if (qParam) p.set('q', qParam);
    setParams(p);
  };

  const allHits: SearchHit[] = results
    ? [...results.stories, ...results.epics, ...results.projects, ...results.comments]
    : [];

  const counts = {
    story: results?.stories.length ?? 0,
    epic: results?.epics.length ?? 0,
    project: results?.projects.length ?? 0,
    comment: results?.comments.length ?? 0,
  };

  const summaryLabel = (() => {
    const parts: string[] = [];
    if (lastQuery) parts.push(`for "${lastQuery}"`);
    if (activeFilterCount > 0) parts.push(`with ${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''}`);
    return parts.length ? parts.join(' ') : 'matching your criteria';
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-emerald-500/10 p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-purple-500/15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <SlidersHorizontal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Advanced search</h1>
            <p className="text-sm text-muted-foreground">
              Search by text, or just apply filters to browse — status, assignee, reporter, story type and more.
            </p>
          </div>
        </div>

        {/* Query input */}
        <div className="relative mt-5 flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyQ()}
              placeholder="Search stories, epics, comments… or leave blank and use filters →"
              aria-label="Search query"
              className="h-11 pl-9"
            />
            {localQ ? (
              <button
                type="button"
                onClick={() => { setLocalQ(''); setFilter('q', ''); }}
                aria-label="Clear query"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <Button onClick={applyQ} className="h-11 px-5">Search</Button>
        </div>
      </div>

      {/* Type tabs (counts) */}
      {results ? (
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((o) => {
            const selected = typeParam === o.value;
            const count =
              o.value === ''        ? counts.story + counts.epic + counts.project + counts.comment :
              o.value === 'story'   ? counts.story :
              o.value === 'epic'    ? counts.epic :
              o.value === 'project' ? counts.project :
                                      counts.comment;
            const accent = o.value ? TYPE_ACCENT[o.value as SearchType] : null;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setFilter('type', o.value)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                  selected
                    ? accent
                      ? cn(accent.chip, 'shadow-sm')
                      : 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted',
                )}
                aria-pressed={selected}
              >
                {o.value ? (
                  <span className={selected ? '' : 'text-muted-foreground/70'}>
                    {TYPE_ICON[o.value as SearchType]}
                  </span>
                ) : null}
                {o.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] tabular-nums',
                    selected ? 'bg-background/60' : 'bg-background',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex gap-6">
        {/* Left-rail filters */}
        <aside
          className="w-60 shrink-0 space-y-5 rounded-xl border bg-card p-4"
          aria-label="Search filters"
        >
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
                  {activeFilterCount}
                </span>
              ) : null}
            </p>
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="filter-status"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Status
            </label>
            <div className="relative">
              {statusParam ? (
                <span
                  className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[statusParam as StoryStatus] }}
                />
              ) : null}
              <select
                id="filter-status"
                value={statusParam}
                onChange={(e) => setFilter('status', e.target.value)}
                className={cn(
                  'w-full rounded-md border bg-background py-1.5 text-sm outline-none transition-colors focus:border-primary',
                  statusParam ? 'pl-7 pr-2' : 'px-2',
                )}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="filter-story-type"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Story type
            </label>
            <div className="relative">
              {storyTypeParam ? (
                <span
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2"
                  style={{ color: STORY_TYPE_ICON[storyTypeParam as StoryType].color }}
                >
                  {STORY_TYPE_ICON[storyTypeParam as StoryType].icon}
                </span>
              ) : null}
              <select
                id="filter-story-type"
                value={storyTypeParam}
                onChange={(e) => setFilter('storyType', e.target.value)}
                className={cn(
                  'w-full rounded-md border bg-background py-1.5 text-sm outline-none transition-colors focus:border-primary',
                  storyTypeParam ? 'pl-8 pr-2' : 'px-2',
                )}
              >
                {STORY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="filter-assignee"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Assignee
            </label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                id="filter-assignee"
                value={assigneeParam}
                onChange={(e) => setFilter('assigneeId', e.target.value)}
                className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-sm outline-none transition-colors focus:border-primary"
              >
                <option value="">Anyone</option>
                <option value="unassigned">Unassigned</option>
                {directory.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="filter-reporter"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Reporter
            </label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select
                id="filter-reporter"
                value={reporterParam}
                onChange={(e) => setFilter('reporterId', e.target.value)}
                className="w-full rounded-md border bg-background py-1.5 pl-7 pr-2 text-sm outline-none transition-colors focus:border-primary"
              >
                <option value="">Anyone</option>
                {directory.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          {projects.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Project
              </p>
              {/* Quick filter — only worth showing once the list is long enough
                  to scroll. */}
              {projects.length > 6 ? (
                <div className="relative mb-1.5">
                  <SearchIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Filter projects…"
                    className="h-8 pl-7 text-sm"
                    aria-label="Filter projects"
                  />
                </div>
              ) : null}
              <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => setFilter('projectId', '')}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    !projectParam
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                  aria-pressed={!projectParam}
                >
                  All projects
                </button>
                {visibleProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFilter('projectId', p.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      projectParam === p.id
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                    aria-pressed={projectParam === p.id}
                  >
                    <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{p.key}</span>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
                {visibleProjects.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No projects match.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>

        {/* Results */}
        <main className="min-w-0 flex-1 space-y-3" aria-label="Search results" aria-live="polite">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg border border-l-4 border-l-muted bg-card"
                />
              ))}
            </div>
          ) : !canSearch ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center">
              <SearchIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">Start your search</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Type at least 2 characters or pick a filter from the left.
              </p>
            </div>
          ) : allHits.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center">
              <p className="text-sm font-medium">No results {summaryLabel}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try widening filters or different keywords.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{allHits.length}</strong> result{allHits.length !== 1 ? 's' : ''}{' '}
                {summaryLabel}
              </p>
              {allHits.map((hit, i) => (
                <HitCard key={`${hit.type}-${hit.id}`} hit={hit} index={i} />
              ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
