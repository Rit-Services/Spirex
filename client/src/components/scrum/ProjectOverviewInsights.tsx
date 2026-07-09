// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { reportApi } from '@/apis/reportApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import { Layers, Flag, Users2 } from 'lucide-react';
import type { Priority, ProjectOverviewResponse } from '@/types/scrum';

// Theme-aware Recharts tooltip (Recharts hardcodes white-on-grey otherwise —
// unreadable in dark mode). Mirrors the Reports page treatment.
const AXIS = 'hsl(var(--muted-foreground))';
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    color: 'hsl(var(--card-foreground))',
    fontSize: 12,
  },
  labelStyle: { color: 'hsl(var(--card-foreground))', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'hsl(var(--card-foreground))' },
};

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'hsl(var(--priority-critical))' },
  high: { label: 'High', color: 'hsl(var(--priority-high))' },
  medium: { label: 'Medium', color: 'hsl(var(--priority-medium))' },
  low: { label: 'Low', color: 'hsl(var(--priority-low))' },
};

export function ProjectOverviewInsights({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reportApi
      .overview(projectId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const workload = data?.workload ?? [];
  const epics = data?.epicProgress ?? [];
  const priority = data?.priority ?? [];
  const maxPriority = Math.max(1, ...priority.map((p) => p.count));

  // Workload = each member's SHARE of the open (not-done) issues. Done issues
  // are excluded entirely; a member with only completed work drops off the
  // chart. Percentages are of the team's total open count, so they sum to 100%.
  const openTotal = workload.reduce((sum, w) => sum + w.remaining, 0);
  const distribution = workload
    .filter((w) => w.remaining > 0)
    .map((w) => ({
      name: w.name,
      open: w.remaining,
      pct: openTotal > 0 ? Math.round((w.remaining / openTotal) * 100) : 0,
    }))
    .sort((a, b) => b.open - a.open);

  return (
    <>
      {/* Team workload — open vs done issues per assignee. */}
      <Card className="animate-slide-up motion-reduce:animate-none" style={{ animationDelay: '220ms' }}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users2 className="h-4 w-4" />
            Team workload
          </CardTitle>
          <CardDescription>Share of open (not done) issues per person</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 animate-pulse rounded-md bg-muted" />
          ) : distribution.length === 0 ? (
            <EmptyState
              title="No open issues"
              description="There's no unfinished work assigned right now."
            />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, distribution.length * 40)}>
              <BarChart
                data={distribution}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  stroke={AXIS}
                  fontSize={11}
                />
                <YAxis type="category" dataKey="name" stroke={AXIS} fontSize={11} width={110} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                  formatter={(value: number, _name, item) => [
                    `${value}% · ${(item?.payload as { open?: number } | undefined)?.open ?? 0} open`,
                    'Workload',
                  ]}
                />
                <Bar dataKey="pct" name="Share of open work" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="pct"
                    position="right"
                    formatter={(v: number) => `${v}%`}
                    fontSize={11}
                    fill="hsl(var(--muted-foreground))"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Epic progress — completed vs total stories per epic. */}
        <Card className="animate-slide-up motion-reduce:animate-none" style={{ animationDelay: '260ms' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Epic progress
            </CardTitle>
            <CardDescription>Completed stories vs total, per epic</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : epics.length === 0 ? (
              <EmptyState title="No epics" description="Create epics to track story progress." />
            ) : (
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {epics.map((e) => {
                  const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
                  return (
                    <div key={e.epicId}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: e.color }}
                            aria-hidden
                          />
                          <span className="truncate font-medium" title={`${e.key} · ${e.title}`}>
                            {e.title}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {e.done}/{e.total} · {pct}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: e.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority distribution — issue counts by priority. */}
        <Card className="animate-slide-up motion-reduce:animate-none" style={{ animationDelay: '300ms' }}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flag className="h-4 w-4" />
              Priority breakdown
            </CardTitle>
            <CardDescription>Open + done issues by priority</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : priority.length === 0 ? (
              <EmptyState title="No issues yet" description="Priorities appear once issues exist." />
            ) : (
              <div className="space-y-3">
                {priority.map((p) => (
                  <div key={p.priority}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{PRIORITY_META[p.priority].label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{p.count}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(p.count / maxPriority) * 100}%`,
                          backgroundColor: PRIORITY_META[p.priority].color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
