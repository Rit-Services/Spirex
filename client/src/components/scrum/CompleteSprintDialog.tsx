// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { completeSprintThunk } from '@/store/sprintSlice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Sprint } from '@/types/scrum';

interface Props {
  sprint: Sprint | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
}

export function CompleteSprintDialog({ sprint, onOpenChange, onCompleted }: Props) {
  const dispatch = useAppDispatch();
  const [target, setTarget] = useState<'backlog' | 'new' | string>('backlog');
  const [submitting, setSubmitting] = useState(false);

  const plannedSprints = useAppSelector((s) =>
    sprint ? (s.sprints.byProject[sprint.projectId] ?? []).filter((x) => x.status === 'planned') : [],
  );
  const storiesOnSprint = useAppSelector((s) =>
    sprint ? s.stories.list.filter((st) => st.sprintId === sprint.id) : [],
  );
  const remaining = storiesOnSprint.filter((s) => s.status !== 'done');
  const remainingPoints = remaining.reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);
  const donePoints = storiesOnSprint
    .filter((s) => s.status === 'done')
    .reduce((acc, s) => acc + (s.storyPoints ?? 0), 0);

  if (!sprint) return null;

  const onConfirm = async () => {
    setSubmitting(true);
    const r = await dispatch(
      completeSprintThunk({
        id: sprint.id,
        incompleteTarget: target === 'backlog' ? undefined : target,
      }),
    );
    setSubmitting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      const created =
        typeof r.payload === 'object' && r.payload ? r.payload.createdSprint : null;
      toast.success(
        created
          ? `Sprint completed — remaining stories moved to ${created.name}`
          : 'Sprint completed',
      );
      onOpenChange(false);
      onCompleted?.();
    } else {
      toast.error((r.payload as string) ?? 'Failed to complete sprint');
    }
  };

  return (
    <Dialog open={!!sprint} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete {sprint.name}</DialogTitle>
          <DialogDescription>
            Closes the sprint and moves stories that aren't yet Done.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Completed</div>
            <div className="font-mono text-base">{donePoints} pts</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Remaining</div>
            <div className="font-mono text-base">
              {remaining.length} stor{remaining.length === 1 ? 'y' : 'ies'} · {remainingPoints} pts
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Move incomplete stories to…</Label>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
              <input
                type="radio"
                name="target"
                value="backlog"
                checked={target === 'backlog'}
                onChange={() => setTarget('backlog')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Back to the backlog</div>
                <div className="text-xs text-muted-foreground">
                  Default. Stories return to backlog status (sprint-less).
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
              <input
                type="radio"
                name="target"
                value="new"
                checked={target === 'new'}
                onChange={() => setTarget('new')}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">Create a new sprint and move them there</div>
                <div className="text-xs text-muted-foreground">
                  Auto-creates a fresh planned sprint and carries the remaining stories forward.
                </div>
              </div>
            </label>

            {plannedSprints.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                <input
                  type="radio"
                  name="target"
                  value={p.id}
                  checked={target === p.id}
                  onChange={() => setTarget(p.id)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium">Move to {p.name}</div>
                  {p.goal ? <div className="text-xs text-muted-foreground">{p.goal}</div> : null}
                </div>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? 'Completing…' : 'Complete sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
