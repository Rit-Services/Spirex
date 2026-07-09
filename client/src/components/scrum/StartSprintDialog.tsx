// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch } from '@/store';
import { startSprintThunk, updateSprintThunk } from '@/store/sprintSlice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { Sprint } from '@/types/scrum';

interface Props {
  sprint: Sprint | null;
  onOpenChange: (open: boolean) => void;
  onStarted?: (sprint: Sprint) => void;
}

function toDateInput(d: string | null): string {
  if (!d) return '';
  return d.slice(0, 10);
}

export function StartSprintDialog({ sprint, onOpenChange, onStarted }: Props) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sprint) {
      setName(sprint.name);
      setGoal(sprint.goal ?? '');
      setStart(toDateInput(sprint.startDate));
      setEnd(toDateInput(sprint.endDate));
    }
  }, [sprint]);

  if (!sprint) return null;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    // Save any edits (name, goal, dates), then start.
    const updated = await dispatch(
      updateSprintThunk({
        id: sprint.id,
        input: {
          name,
          goal: goal || null,
          startDate: start ? new Date(start).toISOString() : null,
          endDate: end ? new Date(end).toISOString() : null,
        },
      }),
    );
    if (updated.meta.requestStatus !== 'fulfilled') {
      setSubmitting(false);
      toast.error((updated.payload as string) ?? 'Failed to save sprint details');
      return;
    }
    const started = await dispatch(startSprintThunk(sprint.id));
    setSubmitting(false);
    if (started.meta.requestStatus === 'fulfilled') {
      toast.success('Sprint started');
      onOpenChange(false);
      onStarted?.(started.payload as Sprint);
    } else {
      toast.error((started.payload as string) ?? 'Failed to start sprint');
    }
  };

  return (
    <Dialog open={!!sprint} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start sprint</DialogTitle>
          <DialogDescription>
            Only one sprint can be active per project. Review the plan before you kick off.
          </DialogDescription>
        </DialogHeader>
        <form id="start-sprint-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sprint-name">Sprint name</Label>
            <Input id="sprint-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sprint-goal">Sprint goal</Label>
            <textarea
              id="sprint-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="What this sprint is aiming to deliver"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sprint-start">Start date</Label>
              <Input
                id="sprint-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sprint-end">End date</Label>
              <Input
                id="sprint-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="start-sprint-form" disabled={submitting}>
            {submitting ? 'Starting…' : 'Start sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
