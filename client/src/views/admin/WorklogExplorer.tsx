// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchUsersThunk } from '@/store/userSlice';
import { useAuth } from '@/hooks/useAuth';
import { reportApi, type WorklogExplorerRange, type WorklogExplorerResponse } from '@/apis/reportApi';
import { extractError } from '@/config/httpClient';
import { formatMinutes } from '@/utils/timeParser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/EmptyState';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

const RANGE_OPTIONS: { value: WorklogExplorerRange; label: string }[] = [
  { value: 'week',       label: 'This week' },
  { value: 'last-week',  label: 'Last week' },
  { value: 'month',      label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'custom',     label: 'Custom range' },
];

export function WorklogExplorer() {
  const dispatch = useAppDispatch();
  const users = useAppSelector((s) => s.users.list);
  const { user: currentUser, can } = useAuth();
  const isAdmin = can('user:manage');

  const [userId, setUserId] = useState<string>(currentUser?.id ?? '');
  const [range, setRange] = useState<WorklogExplorerRange>('week');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [data, setData] = useState<WorklogExplorerResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin && users.length === 0) void dispatch(fetchUsersThunk());
  }, [dispatch, isAdmin, users.length]);

  useEffect(() => {
    if (!userId && currentUser) setUserId(currentUser.id);
  }, [currentUser, userId]);

  useEffect(() => {
    if (!userId) return;
    if (range === 'custom' && (!from || !to)) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await reportApi.worklogExplorer({
          userId,
          range,
          from: range === 'custom' ? new Date(from).toISOString() : undefined,
          to: range === 'custom' ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) toast.error(extractError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, range, from, to]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === userId) ?? (userId === currentUser?.id ? currentUser : undefined),
    [users, userId, currentUser],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Worklog explorer</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? 'Per-user time-logged view with weekly, monthly, and custom filters.'
            : 'Your time logged across all projects, with weekly, monthly, and custom filters.'}
        </p>
      </div>

      <Card className="animate-slide-up motion-reduce:animate-none">
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          {isAdmin ? (
            <div className="min-w-[220px] space-y-1">
              <Label>User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Range</Label>
            <div className="flex flex-wrap gap-1">
              {RANGE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={range === opt.value ? 'default' : 'outline'}
                  onClick={() => setRange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
          {range === 'custom' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="wle-from">From</Label>
                <Input
                  id="wle-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wle-to">To</Label>
                <Input
                  id="wle-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div
        className="grid animate-slide-up gap-4 motion-reduce:animate-none md:grid-cols-3"
        style={{ animationDelay: '70ms' }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Selected user</CardDescription>
            <CardTitle className="text-xl">{selectedUser?.name ?? '—'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {selectedUser?.email}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total logged</CardDescription>
            <CardTitle className="text-xl">
              {data ? formatMinutes(data.totalMinutes) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {data
              ? `${new Date(data.from).toLocaleDateString()} → ${new Date(data.to).toLocaleDateString()}`
              : 'No data yet'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stories touched</CardDescription>
            <CardTitle className="text-xl">{data?.perStory.length ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            across all projects
          </CardContent>
        </Card>
      </div>

      <Card
        className="animate-slide-up motion-reduce:animate-none"
        style={{ animationDelay: '140ms' }}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daily minutes</CardTitle>
          <CardDescription>Minutes logged per day in the selected window.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data && data.daily.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip formatter={(v: number) => formatMinutes(v)} />
                  <Bar dataKey="minutes" name="Minutes" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No time logged in this window"
              description="Pick a different range or user."
            />
          )}
        </CardContent>
      </Card>

      <Card
        className="animate-slide-up motion-reduce:animate-none"
        style={{ animationDelay: '210ms' }}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-story breakdown</CardTitle>
          <CardDescription>Stories the user logged time against.</CardDescription>
        </CardHeader>
        <CardContent>
          {data && data.perStory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Story</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.perStory.map((row) => (
                  <TableRow key={row.storyId}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {row.projectKey}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/projects/${row.projectId}/stories/${row.storyKey}`}
                        className="inline-flex items-center gap-2 hover:underline"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {row.storyKey}
                        </span>
                        <span className="truncate">{row.storyTitle}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.entries}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinutes(row.minutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="No stories" description="No worklogs in this range." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
