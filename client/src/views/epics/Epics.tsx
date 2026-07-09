// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchProjectsThunk, setCurrentProject } from '@/store/projectSlice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { EpicDialog } from '@/components/scrum/EpicDialog';
import { useCurrentProject } from '@/hooks/useCurrentProject';

export function Epics() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);
  const epics = useAppSelector((s) => (id ? s.epics.byProject[id] ?? [] : []));
  const project = projects.find((p) => p.id === id) ?? null;
  const { canInProject } = useCurrentProject();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchEpicsThunk(id));
  }, [dispatch, id, projects.length]);

  if (!id) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold">
            {project?.name ? `${project.name} — Epics` : 'Epics'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Epics group stories into larger themes across sprints.
          </p>
        </div>
        {canInProject('epic:create') ? (
          <Button onClick={() => setDialogOpen(true)}>Create epic</Button>
        ) : null}
      </div>

      {epics.length === 0 ? (
        <EmptyState
          title="No epics yet"
          description="Create your first epic to start grouping related stories."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {epics.map((e, i) => {
            const total = e._count?.stories ?? 0;
            return (
              <Link
                key={e.id}
                to={`/projects/${id}/epics/${e.id}`}
                className="block animate-slide-up motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 12) * 55}ms` }}
              >
                <Card className="overflow-hidden transition-colors hover:border-primary/50">
                  <div className="h-1 w-full" style={{ backgroundColor: e.color }} />
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white"
                        style={{ backgroundColor: e.color }}
                      >
                        {e.key}
                      </span>
                      <CardTitle className="text-base">{e.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <Badge variant="secondary">{e.status.replace('_', ' ')}</Badge>
                      <span>{total} stories</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <EpicDialog open={dialogOpen} onOpenChange={setDialogOpen} projectId={id} />
    </div>
  );
}
