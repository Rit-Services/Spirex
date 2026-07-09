// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState, type ReactNode, type DependencyList } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Bug,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock,
  GaugeCircle,
  Layers,
  Loader2,
  PieChart as PieIcon,
  RefreshCw,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchSprintsThunk } from '@/store/sprintSlice';
import { fetchProjectsThunk, setCurrentProject } from '@/store/projectSlice';
import { reportApi } from '@/apis/reportApi';
import { extractError } from '@/config/httpClient';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/EmptyState';
import { cn } from '@/lib/utils';
import { formatMinutes } from '@/utils/timeParser';
import { STORY_STATUS_LABEL } from '@/types/scrum';
import type {
  StoryStatus,
  StoryType,
  TimeRangeKey,
} from '@/types/scrum';

// ── Palette ───────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<StoryStatus, string> = {
  todo:        '#64748B',
  in_progress: '#3B82F6',
  in_review:   '#8B5CF6',
  qa:          '#F59E0B',
  done:        '#10B981',
};
const TYPE_COLOR: Record<StoryType, string> = { story: '#3B82F6', bug: '#EF4444', task: '#10B981' };
const TYPE_LABEL: Record<StoryType, string> = { story: 'Story', bug: 'Bug', task: 'Task' };
const AXIS = 'hsl(var(--muted-foreground))';

// Recharts hardcodes a white tooltip box + dim grey label text inline, which
// ignores the theme and is unreadable in dark mode. These props repaint the box
// with the same theme tokens the cards use, so it flips with light/dark. The
// Legend below each chart already carries the per-series colour key, so item
// rows use the readable foreground token rather than the dim series colour.
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    color: 'hsl(var(--card-foreground))',
    fontSize: '12px',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.18)',
  },
  labelStyle: { color: 'hsl(var(--card-foreground))', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'hsl(var(--card-foreground))' },
} as const;

// Per-person palette — assigned by ranked-contributor order so the SAME person
// gets the SAME colour in both the per-person panel and the per-story segments.
const PERSON_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1'];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function weeksAgoIsoDate(weeks: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD' or ISO datetime → 'MMM D' (UTC, so it matches server bucketing). */
function shortDate(s: string): string {
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Async data hook: loading / error / retry, with cancellation ─────────────────
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}
function useReportData<T>(fetcher: () => Promise<T>, deps: DependencyList, enabled = true): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(extractError(e).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  return { data, loading, error, retry: () => setNonce((n) => n + 1) };
}

// ── Shared presentational pieces ────────────────────────────────────────────────
function ScopeBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="shrink-0 gap-1 text-[11px] font-normal text-muted-foreground">
      <CircleDot className="h-3 w-3" />
      Scope: <span className="font-medium text-foreground">{label}</span>
    </Badge>
  );
}

function ChartBody({
  loading,
  error,
  empty,
  emptyTitle = 'Nothing to show yet',
  emptyDesc,
  emptyIcon,
  emptyAction,
  onRetry,
  height = 'h-72',
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyTitle?: string;
  emptyDesc?: string;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  height?: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className={cn('flex w-full items-center justify-center', height)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        title="Couldn't load this report"
        description={error}
        action={
          onRetry ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          ) : undefined
        }
      />
    );
  }
  if (empty) return <EmptyState title={emptyTitle} description={emptyDesc} icon={emptyIcon} action={emptyAction} />;
  return <>{children}</>;
}

function KpiCard({ icon, label, value, hint, accent }: {
  icon: ReactNode; label: string; value: string; hint?: string; accent: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}1A`, color: accent }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-xl font-semibold">{value}</div>
        {hint ? <div className="truncate text-[11px] text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}

function DonutPie({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={86}
            innerRadius={52}
            paddingAngle={2}
            label={(e: { percent?: number }) => (e.percent && e.percent > 0.05 ? `${Math.round(e.percent * 100)}%` : '')}
            labelLine={false}
          >
            {data.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Time-logged-per-user ranked bars ────────────────────────────────────────────
// The coloured rank badge + bar are this person's colour everywhere on the tab,
// so this panel doubles as the colour key for the per-story stacked bars below.
function TimePerUserBars({ entries, colorOf }: {
  entries: { userId: string; name: string; email: string; minutes: number }[];
  colorOf: (userId: string) => string;
}) {
  const max = entries[0]?.minutes ?? 1;
  return (
    <div className="space-y-2">
      {entries.map((e, idx) => {
        const pct = max > 0 ? Math.max(2, Math.round((e.minutes / max) * 100)) : 0;
        const color = colorOf(e.userId);
        return (
          <div key={e.userId} className="rounded-lg border bg-card p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 truncate">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ backgroundColor: color }}>
                  {idx + 1}
                </span>
                <span className="truncate font-medium">{e.name}</span>
                <span className="truncate text-xs text-muted-foreground">{e.email}</span>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums">{formatMinutes(e.minutes)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-story stacked bars — one segment per contributor (logger-credited) ──────
function PerStoryStacked({ rows, colorOf, projectId }: {
  rows: { storyId: string; storyKey: string; storyTitle: string; minutes: number; entries: number; byUser: { userId: string; name: string; minutes: number }[] }[];
  colorOf: (userId: string) => string;
  projectId: string;
}) {
  const max = rows[0]?.minutes ?? 1; // rows are sorted desc by the API
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.storyId} className="rounded-lg border bg-card p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <Link to={`/projects/${projectId}/stories/${r.storyKey}`} className="flex min-w-0 items-center gap-2 hover:underline">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{r.storyKey}</span>
              <span className="truncate">{r.storyTitle}</span>
            </Link>
            <span className="shrink-0 font-mono text-sm tabular-nums">{formatMinutes(r.minutes)}</span>
          </div>
          {/* Bar length compares stories (vs the busiest); segments split this
              story by contributor. */}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${max > 0 ? Math.max(2, (r.minutes / max) * 100) : 0}%` }}>
              {r.byUser.map((u) => (
                <div
                  key={u.userId}
                  className="h-full"
                  style={{ width: `${r.minutes > 0 ? (u.minutes / r.minutes) * 100 : 0}%`, backgroundColor: colorOf(u.userId) }}
                  title={`${u.name}: ${formatMinutes(u.minutes)}`}
                />
              ))}
            </div>
          </div>
          {/* Inline per-person legend so the split is explicit, not just on hover. */}
          {r.byUser.length > 1 ? (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {r.byUser.map((u) => (
                <span key={u.userId} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(u.userId) }} />
                  {u.name} · {formatMinutes(u.minutes)}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              {r.byUser[0]?.name ?? '—'} · {r.entries} {r.entries === 1 ? 'entry' : 'entries'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function Reports() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);
  const sprints = useAppSelector((s) => (id ? s.sprints.byProject[id] ?? [] : []));
  const project = projects.find((p) => p.id === id) ?? null;
  const activeSprint = sprints.find((s) => s.status === 'active') ?? null;
  // Kanban projects have no sprints — the Sprint-health tab is hidden for them.
  const isKanban = project?.type === 'kanban';

  // Newest sprint first for the selectors.
  const sprintsSorted = useMemo(
    () => [...sprints].sort((a, b) => (b.startDate ?? b.createdAt).localeCompare(a.startDate ?? a.createdAt)),
    [sprints],
  );

  const [tab, setTab] = useState<'overview' | 'time' | 'sprint'>('overview');

  // Time-tracking filter: a date window OR a specific sprint (value `sprint:<id>`).
  const [period, setPeriod] = useState<string>('week');
  const [customFrom, setCustomFrom] = useState<string>(weeksAgoIsoDate(2));
  const [customTo, setCustomTo] = useState<string>(todayIsoDate());

  // Sprint-health filter.
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [velocityCount, setVelocityCount] = useState<number>(5);

  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchSprintsThunk(id));
  }, [dispatch, id, projects.length]);

  // Default the sprint-health selector to the active sprint (else the newest).
  useEffect(() => {
    if (selectedSprintId) return;
    const def = activeSprint?.id ?? sprintsSorted[0]?.id ?? '';
    if (def) setSelectedSprintId(def);
  }, [activeSprint, sprintsSorted, selectedSprintId]);

  // Overview pies can be scoped to the whole project or just the active sprint.
  // The KPI headline numbers stay whole-project; only the two pies follow this.
  const [overviewScope, setOverviewScope] = useState<'all' | 'sprint'>('all');
  const overviewSprintId = activeSprint?.id ?? '';
  const sprintScoped = overviewScope === 'sprint' && !!overviewSprintId;

  // ── Data ──
  // Overview: a CURRENT snapshot — deliberately NOT date-filtered. The
  // unscoped pair always loads (it also feeds the KPI cards); the sprint-scoped
  // pair only fires when the user picks "Current sprint".
  const statusBd = useReportData(() => reportApi.statusBreakdown(id!), [id], !!id);
  const typeBd = useReportData(() => reportApi.typeBreakdown(id!), [id], !!id);
  const statusBdSprint = useReportData(
    () => reportApi.statusBreakdown(id!, { sprintId: overviewSprintId }),
    [id, overviewSprintId],
    !!id && sprintScoped,
  );
  const typeBdSprint = useReportData(
    () => reportApi.typeBreakdown(id!, { sprintId: overviewSprintId }),
    [id, overviewSprintId],
    !!id && sprintScoped,
  );
  // The source the two pies actually render from, picked by the scope toggle.
  const statusSrc = sprintScoped ? statusBdSprint : statusBd;
  const typeSrc = sprintScoped ? typeBdSprint : typeBd;

  // Time tracking: one window drives the whole tab.
  const tt = useReportData(
    () => {
      if (period.startsWith('sprint:')) return reportApi.timeTracking({ projectId: id!, sprintId: period.slice(7) });
      if (period === 'custom') {
        return reportApi.timeTracking({
          projectId: id!,
          range: 'custom',
          from: new Date(`${customFrom}T00:00:00.000Z`).toISOString(),
          to: new Date(`${customTo}T23:59:59.999Z`).toISOString(),
        });
      }
      return reportApi.timeTracking({ projectId: id!, range: period as TimeRangeKey });
    },
    [id, period, customFrom, customTo],
    !!id,
  );

  // Sprint health.
  const burndown = useReportData(() => reportApi.burndown(selectedSprintId), [selectedSprintId], !!selectedSprintId && !isKanban);
  const est = useReportData(
    () => reportApi.estimateVsLogged(id!, selectedSprintId || undefined),
    [id, selectedSprintId],
    !!id && !isKanban,
  );
  const velocity = useReportData(() => reportApi.velocity(id!, velocityCount), [id, velocityCount], !!id && !isKanban);

  // ── Derived chart data ──
  const statusData = useMemo(
    () => statusSrc.data?.entries.map((e) => ({ name: STORY_STATUS_LABEL[e.status], value: e.count, color: STATUS_COLOR[e.status] })) ?? [],
    [statusSrc.data],
  );
  const typeData = useMemo(
    () => typeSrc.data?.entries.map((e) => ({ name: TYPE_LABEL[e.type], value: e.count, color: TYPE_COLOR[e.type] })) ?? [],
    [typeSrc.data],
  );
  const velocityData = useMemo(
    () => velocity.data?.sprints.map((s) => ({ name: s.sprintName, committed: s.committedStories, completed: s.completedStories })) ?? [],
    [velocity.data],
  );
  const estimateData = useMemo(
    () => est.data?.entries.map((e) => ({
      name: e.name,
      estimate: Math.round((e.estimateMinutes / 60) * 10) / 10,
      logged: Math.round((e.loggedMinutes / 60) * 10) / 10,
    })) ?? [],
    [est.data],
  );

  // Stable per-person colour: ranked contributors (perUser is sorted desc) map
  // onto the palette in order, so the per-person panel and per-story segments
  // agree. Unknown ids fall back to a neutral grey.
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    (tt.data?.perUser ?? []).forEach((u, i) => map.set(u.userId, PERSON_COLORS[i % PERSON_COLORS.length]));
    return (userId: string) => map.get(userId) ?? '#94A3B8';
  }, [tt.data]);

  const selectedSprintName = sprintsSorted.find((s) => s.id === selectedSprintId)?.name ?? '—';
  const doneCount = statusBd.data?.entries.find((e) => e.status === 'done')?.count ?? 0;
  const inProgressCount = statusBd.data?.entries.find((e) => e.status === 'in_progress')?.count ?? 0;
  const bugCount = typeBd.data?.entries.find((e) => e.type === 'bug')?.count ?? 0;

  if (!id) return null;
  if (!project) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="relative animate-slide-up overflow-hidden rounded-2xl border bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-emerald-500/10 p-6 motion-reduce:animate-none">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="relative">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <GaugeCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{project.name} — Reports</h1>
              <p className="text-sm text-muted-foreground">
                Snapshot, time tracking, and sprint health. Each tab shows only the filters that apply to it.
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="overview"><PieIcon className="h-4 w-4" /> Overview</TabsTrigger>
          <TabsTrigger value="time"><Clock className="h-4 w-4" /> Time tracking</TabsTrigger>
          {!isKanban ? (
            <TabsTrigger value="sprint"><Activity className="h-4 w-4" /> Sprint health</TabsTrigger>
          ) : null}
        </TabsList>

        {/* ══ OVERVIEW — current snapshot, no date filtering ══ */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard icon={<Layers className="h-5 w-5" />} label="Total stories" value={String(statusBd.data?.total ?? 0)} hint="all stories in project" accent="#3B82F6" />
            <KpiCard icon={<CircleDot className="h-5 w-5" />} label="In progress" value={String(inProgressCount)} hint="being worked right now" accent="#F59E0B" />
            <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Done" value={String(doneCount)} hint="completed stories" accent="#10B981" />
            <KpiCard icon={<Bug className="h-5 w-5" />} label="Bugs" value={String(bugCount)} hint="of all types" accent="#EF4444" />
          </div>

          {/* Scope toggle for the two distribution pies. Hidden on kanban
              projects, which have no sprints to scope to. */}
          {!isKanban && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Story distribution — switch between the whole project and the active sprint.
              </p>
              <Select value={overviewScope} onValueChange={(v) => setOverviewScope(v as 'all' | 'sprint')}>
                <SelectTrigger className="h-9 w-[230px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stories</SelectItem>
                  <SelectItem value="sprint" disabled={!activeSprint}>
                    {activeSprint ? `Current sprint — ${activeSprint.name}` : 'Current sprint (none active)'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Stories by status</CardTitle>
                    <CardDescription>Where every story stands right now.</CardDescription>
                  </div>
                  <ScopeBadge label={sprintScoped ? (activeSprint?.name ?? 'Current sprint') : 'All stories'} />
                </div>
              </CardHeader>
              <CardContent>
                <ChartBody
                  loading={statusSrc.loading}
                  error={statusSrc.error}
                  empty={statusData.length === 0}
                  emptyTitle="No stories here"
                  emptyDesc={sprintScoped ? 'This sprint has no stories yet.' : "Create stories to see how they're distributed."}
                  onRetry={statusSrc.retry}
                >
                  <DonutPie data={statusData} />
                </ChartBody>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">Stories by type</CardTitle>
                    <CardDescription>Story / Bug / Task split.</CardDescription>
                  </div>
                  <ScopeBadge label={sprintScoped ? (activeSprint?.name ?? 'Current sprint') : 'All stories'} />
                </div>
              </CardHeader>
              <CardContent>
                <ChartBody
                  loading={typeSrc.loading}
                  error={typeSrc.error}
                  empty={typeData.length === 0}
                  emptyTitle="No stories here"
                  emptyDesc={sprintScoped ? 'This sprint has no stories yet.' : 'Create stories to see the type split.'}
                  onRetry={typeSrc.retry}
                >
                  <DonutPie data={typeData} />
                </ChartBody>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══ TIME TRACKING — one window drives every panel ══ */}
        <TabsContent value="time" className="space-y-6">
          {/* Window filter — governs ALL three panels below. */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 py-4">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Period</span>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Whole project</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                    <SelectItem value="last-month">Last month</SelectItem>
                    <SelectItem value="custom">Custom range…</SelectItem>
                    {sprintsSorted.length > 0 ? (
                      <div className="my-1 border-t" />
                    ) : null}
                    {sprintsSorted.map((s) => (
                      <SelectItem key={s.id} value={`sprint:${s.id}`}>Sprint · {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {period === 'custom' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">From</span>
                    <Input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="w-[160px]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">To</span>
                    <Input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="w-[160px]" />
                  </div>
                </>
              ) : null}

              <div className="ml-auto text-xs text-muted-foreground">
                {tt.data ? (
                  <span>
                    Showing <strong className="text-foreground">{tt.data.scope.label}</strong>:{' '}
                    <strong className="text-foreground">{tt.data.from.slice(0, 10)}</strong> →{' '}
                    <strong className="text-foreground">{tt.data.to.slice(0, 10)}</strong>
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* KPIs for the window */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard icon={<Clock className="h-5 w-5" />} label="Total logged" value={formatMinutes(tt.data?.totalMinutes ?? 0)} hint={tt.data ? tt.data.scope.label : '—'} accent="#8B5CF6" />
            <KpiCard icon={<Users className="h-5 w-5" />} label="Contributors" value={String(tt.data?.perUser.length ?? 0)} hint="people who logged time" accent="#3B82F6" />
            <KpiCard icon={<Layers className="h-5 w-5" />} label="Stories touched" value={String(tt.data?.perStory.length ?? 0)} hint="stories with worklogs" accent="#10B981" />
          </div>

          {/* Daily logged */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></div>
                  <div>
                    <CardTitle className="text-base">Time logged per day</CardTitle>
                    <CardDescription>Actual worklog minutes, summed by day (UTC).</CardDescription>
                  </div>
                </div>
                {tt.data ? <ScopeBadge label={tt.data.scope.label} /> : null}
              </div>
            </CardHeader>
            <CardContent>
              <ChartBody
                loading={tt.loading}
                error={tt.error}
                empty={!tt.data || tt.data.daily.every((d) => d.minutes === 0)}
                emptyTitle="No time logged in this period"
                emptyDesc="Log work on any story to start seeing daily totals."
                onRetry={tt.retry}
                height="h-64"
              >
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tt.data?.daily ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
                      <YAxis
                        stroke={AXIS}
                        fontSize={11}
                        tickFormatter={(v: number) => (v >= 60 ? `${Math.round(v / 60)}h` : `${v}m`)}
                      />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(v: number) => [formatMinutes(v), 'Logged']}
                        labelFormatter={(l: string) => shortDate(l)}
                      />
                      <Bar dataKey="minutes" name="Logged" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartBody>
            </CardContent>
          </Card>

          {/* Per user */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10 text-purple-600"><Users className="h-4 w-4" /></div>
                  <div>
                    <CardTitle className="text-base">Time logged per person</CardTitle>
                    <CardDescription>Ranked by hours recorded in this period.</CardDescription>
                  </div>
                </div>
                {tt.data ? <ScopeBadge label={tt.data.scope.label} /> : null}
              </div>
            </CardHeader>
            <CardContent>
              <ChartBody
                loading={tt.loading}
                error={tt.error}
                empty={!tt.data || tt.data.perUser.length === 0}
                emptyTitle="No time logged in this period"
                emptyDesc="Log work on any story to start seeing totals here."
                onRetry={tt.retry}
                height="h-40"
              >
                <TimePerUserBars entries={tt.data?.perUser ?? []} colorOf={colorOf} />
              </ChartBody>
            </CardContent>
          </Card>

          {/* Per story */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600"><Layers className="h-4 w-4" /></div>
                  <div>
                    <CardTitle className="text-base">Time logged per story</CardTitle>
                    <CardDescription>Each bar splits by contributor — colours match the people above.</CardDescription>
                  </div>
                </div>
                {tt.data ? <ScopeBadge label={tt.data.scope.label} /> : null}
              </div>
            </CardHeader>
            <CardContent>
              <ChartBody
                loading={tt.loading}
                error={tt.error}
                empty={!tt.data || tt.data.perStory.length === 0}
                emptyTitle="No worklogs in this period"
                emptyDesc="Once people log time on stories, they'll appear here."
                onRetry={tt.retry}
                height="h-40"
              >
                <PerStoryStacked rows={tt.data?.perStory ?? []} colorOf={colorOf} projectId={id} />
              </ChartBody>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══ SPRINT HEALTH (scrum only) ══ */}
        {!isKanban ? (
        <TabsContent value="sprint" className="space-y-6">
          {/* Sprint selector — drives burndown + estimate vs logged. */}
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 py-4">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sprint</span>
                <Select value={selectedSprintId} onValueChange={setSelectedSprintId}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder={sprintsSorted.length ? 'Select a sprint…' : 'No sprints yet'} />
                  </SelectTrigger>
                  <SelectContent>
                    {sprintsSorted.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.status === 'active' ? ' · active' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">
                Burndown &amp; estimate vs logged below reflect the selected sprint.
              </div>
            </CardContent>
          </Card>

          {/* Burndown */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Sprint burndown</CardTitle>
                  <CardDescription>Remaining story points per day vs the ideal line.</CardDescription>
                </div>
                <ScopeBadge label={selectedSprintName} />
              </div>
            </CardHeader>
            <CardContent>
              <ChartBody
                loading={burndown.loading}
                error={burndown.error}
                empty={!burndown.data || burndown.data.days.length <= 1}
                emptyTitle={selectedSprintId ? 'Not enough data yet' : 'No sprint selected'}
                emptyDesc={selectedSprintId ? 'A burndown needs at least two days of a started sprint.' : 'Pick a sprint to see its burndown.'}
                onRetry={burndown.retry}
              >
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={burndown.data?.days ?? []} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={shortDate} stroke={AXIS} fontSize={11} />
                      <YAxis
                        stroke={AXIS}
                        fontSize={11}
                        allowDecimals={false}
                        label={{ value: 'Story points', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: AXIS, textAnchor: 'middle' } }}
                      />
                      <Tooltip {...TOOLTIP_STYLE} labelFormatter={(l: string) => shortDate(l)} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" dataKey="ideal" name="Ideal" stroke={AXIS} strokeDasharray="4 4" dot={false} />
                      <Line type="monotone" dataKey="remaining" name="Remaining" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartBody>
            </CardContent>
          </Card>

          {/* Estimate vs logged */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 text-amber-600"><Timer className="h-4 w-4" /></div>
                  <div>
                    <CardTitle className="text-base">Estimated vs logged time</CardTitle>
                    <CardDescription>
                      Estimate follows each story's assignee; logged time is credited to whoever logged it.{' '}
                      {est.data ? `Estimate ${formatMinutes(est.data.totalEstimateMinutes)} · logged ${formatMinutes(est.data.totalLoggedMinutes)}.` : null}
                    </CardDescription>
                  </div>
                </div>
                <ScopeBadge label={selectedSprintName} />
              </div>
            </CardHeader>
            <CardContent>
              <ChartBody
                loading={est.loading}
                error={est.error}
                empty={estimateData.length === 0}
                emptyTitle="No estimates or time yet"
                emptyDesc="Set original estimates on stories, or log time, to compare them here."
                onRetry={est.retry}
              >
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={estimateData} layout="vertical" margin={{ top: 8, right: 24, bottom: 16, left: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        type="number"
                        stroke={AXIS}
                        fontSize={11}
                        label={{ value: 'Hours', position: 'insideBottom', offset: -4, style: { fontSize: 11, fill: AXIS } }}
                      />
                      <YAxis type="category" dataKey="name" stroke={AXIS} fontSize={11} width={120} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${v} h`} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="estimate" name="Estimated (h)" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="logged" name="Logged (h)" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartBody>
            </CardContent>
          </Card>

          {/* Velocity — a multi-sprint trend, clearly distinct from the single-sprint views above */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600"><TrendingUp className="h-4 w-4" /></div>
                  <div>
                    <CardTitle className="text-base">Velocity</CardTitle>
                    <CardDescription>Stories committed vs completed across recent completed sprints.</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ScopeBadge label={`Last ${velocityCount} completed`} />
                  <Select value={String(velocityCount)} onValueChange={(v) => setVelocityCount(Number(v))}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">Last 3 sprints</SelectItem>
                      <SelectItem value="5">Last 5 sprints</SelectItem>
                      <SelectItem value="10">Last 10 sprints</SelectItem>
                      <SelectItem value="20">Last 20 sprints</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ChartBody
                loading={velocity.loading}
                error={velocity.error}
                empty={velocityData.length === 0}
                emptyTitle="No completed sprints yet"
                emptyDesc="Velocity appears once you complete a sprint."
                onRetry={velocity.retry}
              >
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={velocityData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke={AXIS} fontSize={11} />
                      <YAxis
                        stroke={AXIS}
                        fontSize={11}
                        allowDecimals={false}
                        label={{ value: 'Stories', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: AXIS, textAnchor: 'middle' } }}
                      />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="committed" name="Committed (stories)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completed (stories)" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartBody>
            </CardContent>
          </Card>
        </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
