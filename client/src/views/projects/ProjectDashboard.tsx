// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk, setCurrentProject } from '@/store/projectSlice';
import { fetchSprintsThunk } from '@/store/sprintSlice';
import { fetchStoriesThunk } from '@/store/storySlice';
import { reportApi } from '@/apis/reportApi';
import { formatMinutes } from '@/utils/timeParser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { Settings } from 'lucide-react';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useProjectStatuses } from '@/hooks/useProjectStatuses';
import { ProjectOverviewInsights } from '@/components/scrum/ProjectOverviewInsights';
import { type StoryStatus, type TimePerUserResponse } from '@/types/scrum';

export function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { list, loading } = useAppSelector((s) => s.projects);
  const sprints = useAppSelector((s) => (id ? s.sprints.byProject[id] ?? [] : []));
  const stories = useAppSelector((s) => s.stories.list);
  const project = list.find((p) => p.id === id) ?? null;
  const { canInProject } = useCurrentProject();
  const { byCore: statusByCore } = useProjectStatuses(id);

  const activeSprint = sprints.find((s) => s.status === 'active') ?? null;
  const [timeReport, setTimeReport] = useState<TimePerUserResponse | null>(null);
  // Whether the projects list has actually been fetched. Critical for cold
  // loads — opening /projects/:id in a fresh tab starts with an empty store and
  // loading=false, so without this gate the render below would treat the
  // not-yet-loaded project as "not found" and bounce to /projects before the
  // fetch even begins. Starts true when the list is already populated (in-app
  // nav) so there's no loading flash.
  const [projectsReady, setProjectsReady] = useState(list.length > 0);

  useEffect(() => {
    if (list.length > 0) {
      setProjectsReady(true);
      return;
    }
    void dispatch(fetchProjectsThunk()).finally(() => setProjectsReady(true));
  }, [dispatch, list.length]);

  useEffect(() => {
    if (!id) return;
    void reportApi.timePerUser(id, 'week').then(setTimeReport).catch(() => setTimeReport(null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    void dispatch(fetchSprintsThunk(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (!id || !activeSprint) return;
    void dispatch(fetchStoriesThunk({ projectId: id, sprintId: activeSprint.id }));
  }, [dispatch, id, activeSprint?.id, activeSprint]);

  const { totalPts, donePts, pct, storyCounts, totalOnSprint } = useMemo(() => {
    const total = stories.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
    const done = stories
      .filter((s) => s.status === 'done')
      .reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
    const counts: Record<StoryStatus, number> = {
      todo: 0, in_progress: 0, in_review: 0, qa: 0, done: 0,
    };
    for (const s of stories) counts[s.status]++;
    return {
      totalPts: total,
      donePts: done,
      pct: total === 0 ? 0 : Math.round((done / total) * 100),
      storyCounts: counts,
      totalOnSprint: stories.length,
    };
  }, [stories]);

  // Hold the loading state until the list is fetched — only then is a missing
  // project a real 404 worth redirecting on (e.g. a deep link to a project you
  // can't access). This is what makes "open in new tab" land on the overview.
  if (!projectsReady || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!project) return <Navigate to="/projects" replace />;

  const boardStatuses: StoryStatus[] = ['todo', 'in_progress', 'in_review', 'qa', 'done'];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
              {project.key}
            </span>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
          </div>
          {project.description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">{project.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${project.id}/backlog`}>Backlog</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${project.id}/sprints`}>Sprints</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${project.id}/board`}>Board</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${project.id}/epics`}>Epics</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/projects/${project.id}/reports`}>Reports</Link>
          </Button>
          {canInProject('project:edit') || canInProject('member:manage') ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/projects/${project.id}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="animate-slide-up motion-reduce:animate-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active sprint</CardTitle>
            <CardDescription>Progress this sprint</CardDescription>
          </CardHeader>
          <CardContent>
            {activeSprint ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{activeSprint.name}</span>
                  <Badge>active</Badge>
                </div>
                {activeSprint.goal ? (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{activeSprint.goal}</p>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {donePts}/{totalPts} pts · {pct}%
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/projects/${project.id}/board`}>Open board</Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                title="No active sprint"
                description="Start a planned sprint from the Sprints page."
              />
            )}
          </CardContent>
        </Card>

        <Card
          className="animate-slide-up motion-reduce:animate-none"
          style={{ animationDelay: '60ms' }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Stories by phase</CardTitle>
            <CardDescription>Active sprint · {totalOnSprint} total</CardDescription>
          </CardHeader>
          <CardContent>
            {activeSprint ? (
              <ul className="space-y-1.5 text-sm">
                {boardStatuses.map((st) => (
                  <li key={st} className="flex items-center justify-between">
                    <span style={{ color: statusByCore[st].color }}>{statusByCore[st].label}</span>
                    <span className="font-mono">{storyCounts[st]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No stories" description="Waiting on an active sprint." />
            )}
          </CardContent>
        </Card>

        <Card
          className="animate-slide-up motion-reduce:animate-none"
          style={{ animationDelay: '120ms' }}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hours this week</CardTitle>
            <CardDescription>Time logged by the team</CardDescription>
          </CardHeader>
          <CardContent>
            {timeReport && timeReport.entries.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {timeReport.entries.slice(0, 5).map((e) => (
                  <li key={e.userId} className="flex items-center justify-between">
                    <span className="truncate text-muted-foreground">{e.name}</span>
                    <span className="font-mono">{formatMinutes(e.minutes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No time logged"
                description="Log work on a story to start tracking."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card
        className="animate-slide-up motion-reduce:animate-none"
        style={{ animationDelay: '180ms' }}
      >
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
          <CardDescription>{project.members?.length ?? 0} members</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(project.members ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs"
            >
              <span className="font-medium">{m.user.name}</span>
              <span className="text-muted-foreground">· {m.projectRole}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <ProjectOverviewInsights projectId={project.id} />
    </div>
  );
}
