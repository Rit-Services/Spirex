// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk } from '@/store/projectSlice';
import { sprintApi } from '@/apis/sprintApi';
import { reportApi } from '@/apis/reportApi';
import { storyApi, type AssignedIssue } from '@/apis/storyApi';
import { formatMinutes } from '@/utils/timeParser';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PriorityBadge } from '@/components/scrum/PriorityBadge';
import { StoryTypeIcon } from '@/components/scrum/StoryTypeIcon';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { FolderKanban, Zap, Clock, ArrowRight, ListChecks } from 'lucide-react';
import { STORY_STATUS_LABEL, type Sprint, type StoryStatus } from '@/types/scrum';

// "My issues" widget — the open statuses shown, in the requested priority order
// (In Progress → To Do → Review → QA). `done` is intentionally excluded. The
// chips below let the user toggle which of these appear.
const MY_ISSUE_STATUSES: StoryStatus[] = ['in_progress', 'todo', 'in_review', 'qa'];
const STATUS_CHIP_STYLE: Record<StoryStatus, string> = {
  in_progress: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  todo: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20',
  in_review: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20',
  qa: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
};
const MY_ISSUES_LIMIT = 20;

interface ActiveRow {
  projectId: string;
  projectKey: string;
  projectName: string;
  sprint: Sprint;
}

interface HoursRow {
  projectId: string;
  projectKey: string;
  projectName: string;
  minutes: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);
  const loading = useAppSelector((s) => s.projects.loading);

  const [activeSprints, setActiveSprints] = useState<ActiveRow[]>([]);
  const [myHours, setMyHours] = useState<HoursRow[]>([]);
  const [aggregating, setAggregating] = useState(false);

  // "My issues" — assigned to me across all projects. `statusFilter` is a
  // POSITIVE selection: an empty array means "All" (show every open status);
  // clicking a chip narrows to it (keep that, discard the rest), and further
  // clicks add more. Empty default = everything shown, no reverse-toggle feel.
  const [myIssues, setMyIssues] = useState<AssignedIssue[]>([]);
  const [myIssuesTotal, setMyIssuesTotal] = useState(0);
  const [myIssuesLoading, setMyIssuesLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StoryStatus[]>([]);

  // Fetch once on mount. Intentionally excludes projects.length / loading from
  // deps — including them causes an infinite refetch when the API returns []
  // (loading flips back to false, list stays empty, effect re-fires forever).
  useEffect(() => {
    if (projects.length === 0 && !loading) void dispatch(fetchProjectsThunk());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    if (projects.length === 0 || !user) return;
    let cancelled = false;
    setAggregating(true);
    (async () => {
      const activeRows: ActiveRow[] = [];
      const hoursRows: HoursRow[] = [];
      await Promise.all(
        projects.map(async (p) => {
          try {
            const sprints = await sprintApi.list(p.id);
            const active = sprints.find((s) => s.status === 'active');
            if (active) {
              activeRows.push({ projectId: p.id, projectKey: p.key, projectName: p.name, sprint: active });
            }
          } catch { /* non-fatal */ }
          try {
            const report = await reportApi.timePerUser(p.id, 'week');
            const mine = report.entries.find((e) => e.userId === user.id);
            if (mine && mine.minutes > 0) {
              hoursRows.push({ projectId: p.id, projectKey: p.key, projectName: p.name, minutes: mine.minutes });
            }
          } catch { /* non-fatal */ }
        }),
      );
      if (cancelled) return;
      setActiveSprints(activeRows.sort((a, b) => a.projectName.localeCompare(b.projectName)));
      setMyHours(hoursRows.sort((a, b) => b.minutes - a.minutes));
      setAggregating(false);
    })();
    return () => { cancelled = true; };
  }, [projects, user]);

  // Fetch "my issues" whenever the status filter changes. One request (server
  // scopes to the active org + me and returns them already prioritised), so
  // this is independent of the per-project aggregation above.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setMyIssuesLoading(true);
    storyApi
      .assignedToMe({ statuses: statusFilter, limit: MY_ISSUES_LIMIT })
      .then((r) => {
        if (cancelled) return;
        setMyIssues(r.issues);
        setMyIssuesTotal(r.total);
      })
      .catch(() => {
        if (!cancelled) {
          setMyIssues([]);
          setMyIssuesTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setMyIssuesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, statusFilter]);

  const toggleStatus = (s: StoryStatus) =>
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const totalMyMinutes = useMemo(() => myHours.reduce((acc, r) => acc + r.minutes, 0), [myHours]);

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      {/*
       * Welcome banner — RJ-9: previously rendered without the card
       * background used by the other dashboard panels, which broke the
       * visual rhythm and made the text harder to read. It now uses the
       * same `bg-card` + border + shadow as the Projects / Active sprints /
       * Hours panels below, while keeping the subtle primary-tinted gradient
       * accent on top for hierarchy.
       */}
      <div
        data-testid="dashboard-welcome-banner"
        className="relative overflow-hidden rounded-xl border bg-card p-6 shadow-card ring-1 ring-primary/10 enter"
      >
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-primary/4 to-transparent" />
        {/* Decorative orb */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/6 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 right-24 h-24 w-24 rounded-full bg-violet-500/5 blur-2xl" />

        <div className="relative">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/70">
            {timeGreeting}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back
            {user ? (
              <span className="ml-1.5 gradient-text">{user.name.split(' ')[0]}</span>
            ) : null}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Here's what's happening across your workspace today.
          </p>

          {!loading && projects.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary ring-1 ring-primary/15">
                <FolderKanban className="h-3 w-3" />
                {projects.length} project{projects.length !== 1 ? 's' : ''}
              </span>
              {activeSprints.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-emerald-500/15 dark:text-emerald-400">
                  <Zap className="h-3 w-3" />
                  {activeSprints.length} active sprint{activeSprints.length !== 1 ? 's' : ''}
                </span>
              )}
              {totalMyMinutes > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-500/15 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  {formatMinutes(totalMyMinutes)} this week
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* Projects card */}
        {/* fade-in (opacity only) not slide-up: card-lift's hover uses transform,
            and a filled transform-based entrance would override that hover. */}
        <Card
          className="card-lift gradient-border animate-fade-in motion-reduce:animate-none"
          style={{ animationDelay: '60ms' }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FolderKanban className="h-4 w-4" />
              </span>
              Projects
            </CardTitle>
            <CardDescription>
              {projects.length > 0
                ? `${projects.length} project${projects.length === 1 ? '' : 's'} you're a member of`
                : "Projects you're a member of"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && projects.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description="Create your first project to start tracking work."
                action={
                  <Button asChild size="sm">
                    <Link to="/projects">Go to Projects</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-1 text-sm">
                {projects.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent"
                    >
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                        {p.key}
                      </span>
                      <span className="truncate">{p.name}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
                {projects.length > 6 ? (
                  <li className="px-2 pt-1">
                    <Link to="/projects" className="text-xs text-primary hover:underline">
                      View all {projects.length} projects →
                    </Link>
                  </li>
                ) : null}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Active sprints card */}
        <Card
          className="card-lift gradient-border animate-fade-in motion-reduce:animate-none"
          style={{ animationDelay: '120ms' }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Zap className="h-4 w-4" />
              </span>
              Active sprints
            </CardTitle>
            <CardDescription>One line per project with a sprint in flight.</CardDescription>
          </CardHeader>
          <CardContent>
            {aggregating && activeSprints.length === 0 ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : activeSprints.length === 0 ? (
              <EmptyState
                title="Nothing active"
                description="Start a planned sprint on any project to see it here."
              />
            ) : (
              <ul className="space-y-1 text-sm">
                {activeSprints.map((row) => (
                  <li key={row.projectId}>
                    <Link
                      to={`/projects/${row.projectId}/board`}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                          {row.projectKey}
                        </span>
                        <span className="truncate">{row.sprint.name}</span>
                      </span>
                      <Badge variant="success" className="shrink-0">active</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Hours card */}
        <Card
          className="card-lift gradient-border animate-fade-in motion-reduce:animate-none"
          style={{ animationDelay: '180ms' }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Clock className="h-4 w-4" />
              </span>
              Hours this week
            </CardTitle>
            <CardDescription>
              Time you've logged this week
              {totalMyMinutes > 0 ? ` · ${formatMinutes(totalMyMinutes)} total` : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aggregating && myHours.length === 0 ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : myHours.length === 0 ? (
              <EmptyState
                title="No time logged yet"
                description="Open a story and use Log work to start tracking."
              />
            ) : (
              <ul className="space-y-1 text-sm">
                {myHours.slice(0, 6).map((row) => (
                  <li key={row.projectId} className="flex items-center justify-between">
                    <Link
                      to={`/projects/${row.projectId}/reports`}
                      className="flex min-w-0 items-center gap-2 truncate rounded-lg px-2 py-1.5 hover:bg-accent"
                    >
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                        {row.projectKey}
                      </span>
                      <span className="truncate text-muted-foreground">{row.projectName}</span>
                    </Link>
                    <span className="shrink-0 font-mono text-xs font-medium tabular-nums">
                      {formatMinutes(row.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* My issues — assigned to me, across all projects, prioritised by status */}
      <Card className="animate-fade-in motion-reduce:animate-none" style={{ animationDelay: '240ms' }}>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListChecks className="h-4 w-4" />
                </span>
                My issues
              </CardTitle>
              <CardDescription>
                Assigned to you across all projects
                {myIssuesTotal > 0 ? ` · showing ${myIssues.length} of ${myIssuesTotal}` : ''}.
              </CardDescription>
            </div>
            {/* Status filter — positive selection. "All" shows every open
                status; clicking a status narrows to it (keep that, discard the
                rest), and more clicks add to the set. */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter([])}
                aria-pressed={statusFilter.length === 0}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors',
                  statusFilter.length === 0
                    ? 'bg-primary/10 text-primary ring-primary/20'
                    : 'bg-transparent text-muted-foreground ring-border hover:bg-accent',
                )}
              >
                All
              </button>
              {MY_ISSUE_STATUSES.map((s) => {
                const on = statusFilter.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors',
                      on
                        ? STATUS_CHIP_STYLE[s]
                        : 'bg-transparent text-muted-foreground ring-border hover:bg-accent',
                    )}
                  >
                    {STORY_STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {myIssuesLoading && myIssues.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : myIssues.length === 0 ? (
            <EmptyState
              title="Nothing assigned to you"
              description={
                statusFilter.length === 0
                  ? 'You have no open issues assigned to you.'
                  : 'No assigned issues match the selected statuses.'
              }
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {myIssues.map((it) => (
                <li key={it.id}>
                  <Link
                    to={{
                      pathname: `/projects/${it.projectId}/stories/${it.key}`,
                      // Origin hint for the issue page's "Back" when opened in a
                      // NEW TAB (no browser history to pop). Same-tab clicks
                      // ignore this and just pop history.
                      search: `?from=${encodeURIComponent('/dashboard')}&fromLabel=dashboard`,
                    }}
                    className="flex items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-accent"
                  >
                    <StoryTypeIcon type={it.type} />
                    <span
                      className="max-w-[140px] shrink-0 truncate rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                      title={`${it.project.name} (${it.project.key})`}
                    >
                      {it.project.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{it.key}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{it.title}</span>
                    <PriorityBadge priority={it.priority} />
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
                        STATUS_CHIP_STYLE[it.status],
                      )}
                    >
                      {STORY_STATUS_LABEL[it.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
