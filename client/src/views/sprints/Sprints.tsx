// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  deleteSprintThunk,
  fetchSprintsThunk,
} from '@/store/sprintSlice';
import { CreateSprintDialog } from '@/components/scrum/CreateSprintDialog';
import {
  fetchProjectsThunk,
  setCurrentProject,
} from '@/store/projectSlice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/EmptyState';
import { StartSprintDialog } from '@/components/scrum/StartSprintDialog';
import { CompleteSprintDialog } from '@/components/scrum/CompleteSprintDialog';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { toast } from 'sonner';
import type { Sprint, SprintStatus } from '@/types/scrum';

const STATUS_ORDER: SprintStatus[] = ['active', 'planned', 'completed'];
const STATUS_LABEL: Record<SprintStatus, string> = {
  active: 'Active',
  planned: 'Planned',
  completed: 'Completed',
};

function fmt(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

export function Sprints() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);
  const sprints = useAppSelector((s) => (id ? s.sprints.byProject[id] ?? [] : []));
  const project = projects.find((p) => p.id === id) ?? null;
  const { canInProject } = useCurrentProject();

  const [startCandidate, setStartCandidate] = useState<Sprint | null>(null);
  const [completeCandidate, setCompleteCandidate] = useState<Sprint | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Sprint | null>(null);
  const [editCandidate, setEditCandidate] = useState<Sprint | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchSprintsThunk(id));
  }, [dispatch, id, projects.length]);

  if (!id) return null;

  const grouped = STATUS_ORDER.reduce<Record<SprintStatus, Sprint[]>>(
    (acc, s) => ((acc[s] = sprints.filter((sp) => sp.status === s)), acc),
    { active: [], planned: [], completed: [] },
  );

  const onCreateSprint = () => setCreateOpen(true);

  const onConfirmDelete = async () => {
    if (!deleteCandidate) return;
    setDeleting(true);
    const r = await dispatch(
      deleteSprintThunk({ projectId: id, id: deleteCandidate.id }),
    );
    setDeleting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(`Deleted ${deleteCandidate.name}`);
      setDeleteCandidate(null);
    } else {
      toast.error((r.payload as string) ?? 'Failed to delete sprint');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/projects/${id}`}>← Back to project</Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold">
            {project?.name ? `${project.name} — Sprints` : 'Sprints'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Plan, start, and close sprints. Only one sprint can be active per project.
          </p>
        </div>
        {canInProject('sprint:create') ? (
          <Button onClick={onCreateSprint}>New sprint</Button>
        ) : null}
      </div>

      {sprints.length === 0 ? (
        <EmptyState
          title="No sprints yet"
          description="Create a planned sprint, move backlog stories onto it, then start."
        />
      ) : (
        STATUS_ORDER.map((status) => {
          const list = grouped[status];
          if (list.length === 0) return null;
          return (
            <section key={status} className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {STATUS_LABEL[status]} · {list.length}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {list.map((sp, i) => (
                  <Card
                    key={sp.id}
                    className="animate-slide-up motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 12) * 55}ms` }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Link
                          to={`/projects/${id}/sprints/${sp.id}`}
                          className="hover:underline"
                        >
                          <CardTitle className="text-base">{sp.name}</CardTitle>
                        </Link>
                        <Badge
                          variant={
                            sp.status === 'active'
                              ? 'default'
                              : sp.status === 'completed'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {sp.status}
                        </Badge>
                      </div>
                      {sp.goal ? <CardDescription>{sp.goal}</CardDescription> : null}
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{fmt(sp.startDate)} → {fmt(sp.endDate)}</span>
                        <span>{sp._count?.stories ?? 0} stories</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sp.status === 'active' ? (
                          <>
                            <Button asChild size="sm" variant="default">
                              <Link to={`/projects/${id}/board`}>Open board</Link>
                            </Button>
                            {canInProject('sprint:complete') ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCompleteCandidate(sp)}
                              >
                                Complete sprint
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {sp.status === 'planned' ? (
                          <>
                            {canInProject('sprint:start') ? (
                              <Button size="sm" onClick={() => setStartCandidate(sp)}>
                                Start sprint
                              </Button>
                            ) : null}
                            {canInProject('sprint:edit') ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditCandidate(sp)}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {canInProject('sprint:delete') ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteCandidate(sp)}
                                aria-label={`Delete ${sp.name}`}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {sp.status !== 'active' ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={`/projects/${id}/sprints/${sp.id}`}>
                              View details
                            </Link>
                          </Button>
                        ) : null}
                        {sp.status === 'completed' ? (
                          <span className="text-xs text-muted-foreground">
                            Completed {fmt(sp.completedAt)}
                          </span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      )}

      <StartSprintDialog
        sprint={startCandidate}
        onOpenChange={(open) => !open && setStartCandidate(null)}
      />
      <CompleteSprintDialog
        sprint={completeCandidate}
        onOpenChange={(open) => !open && setCompleteCandidate(null)}
      />
      <CreateSprintDialog
        projectId={id}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <CreateSprintDialog
        projectId={id}
        sprint={editCandidate}
        open={!!editCandidate}
        onOpenChange={(open) => !open && setEditCandidate(null)}
        onSaved={() => setEditCandidate(null)}
      />

      <Dialog
        open={!!deleteCandidate}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete sprint?</DialogTitle>
            <DialogDescription>
              {deleteCandidate ? (
                <>
                  <span className="font-medium">{deleteCandidate.name}</span> will be removed.
                  Any stories assigned to it will fall back to the backlog.
                  This cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCandidate(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete sprint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
