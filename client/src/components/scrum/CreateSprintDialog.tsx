// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { createSprintThunk, updateSprintThunk } from '@/store/sprintSlice';
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
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (sprint: Sprint) => void;
  /** When set, the dialog edits this sprint instead of creating a new one. */
  sprint?: Sprint | null;
  onSaved?: (sprint: Sprint) => void;
}

function todayInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** ISO datetime → the local yyyy-mm-dd a <input type="date"> expects. */
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function addWeeks(dateInput: string, weeks: number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  d.setDate(d.getDate() + weeks * 7);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function CreateSprintDialog({ projectId, open, onOpenChange, onCreated, sprint, onSaved }: Props) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((s) => s.projects.list.find((p) => p.id === projectId) ?? null);
  const sprints = useAppSelector((s) => s.sprints.byProject[projectId] ?? []);
  const isEdit = !!sprint;

  const sprintLengthWeeks = project?.defaultSprintLengthWeeks ?? 2;
  const projectKey = project?.key ?? 'SPR';

  const defaultName = () => {
    // Find the next available "${key} Sprint N" not already used in this project.
    const existing = new Set(sprints.map((s) => s.name));
    let n = sprints.length + 1;
    while (existing.has(`${projectKey} Sprint ${n}`)) n += 1;
    return `${projectKey} Sprint ${n}`;
  };

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState(todayInput());
  const [end, setEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (sprint) {
      // Edit mode — seed from the sprint being edited.
      setName(sprint.name);
      setGoal(sprint.goal ?? '');
      setStart(isoToDateInput(sprint.startDate) || todayInput());
      setEnd(isoToDateInput(sprint.endDate));
      return;
    }
    const startInit = todayInput();
    setName(defaultName());
    setGoal('');
    setStart(startInit);
    setEnd(addWeeks(startInit, sprintLengthWeeks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, sprints.length, sprintLengthWeeks, projectKey, sprint?.id]);

  // When user changes start date manually, slide the end date forward by the
  // project's default sprint length — but only if they haven't customised it
  // away from the previously-derived value.
  const onStartChange = (next: string) => {
    const previousAuto = addWeeks(start, sprintLengthWeeks);
    setStart(next);
    if (!end || end === previousAuto) {
      setEnd(addWeeks(next, sprintLengthWeeks));
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Sprint name is required');
      return;
    }
    if (!start) {
      toast.error('Start date is required');
      return;
    }
    // Name must stay unique within the project — but a sprint doesn't clash
    // with itself when editing.
    if (sprints.some((s) => s.name === name.trim() && s.id !== sprint?.id)) {
      toast.error(`A sprint named "${name.trim()}" already exists`);
      return;
    }
    const payload = {
      name: name.trim(),
      goal: goal.trim() || null,
      startDate: new Date(start).toISOString(),
      endDate: end ? new Date(end).toISOString() : null,
    };
    setSubmitting(true);
    const r = isEdit
      ? await dispatch(updateSprintThunk({ id: sprint!.id, input: payload }))
      : await dispatch(createSprintThunk({ projectId, ...payload }));
    setSubmitting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(isEdit ? 'Sprint updated' : 'Sprint created');
      onOpenChange(false);
      const saved = r.payload as Sprint;
      if (isEdit) onSaved?.(saved);
      else onCreated?.(saved);
    } else {
      toast.error((r.payload as string) ?? `Failed to ${isEdit ? 'update' : 'create'} sprint`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit sprint' : 'Create sprint'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the name, goal or dates. Sprint name must be unique within this project.'
              : 'Defaults are pre-filled from project settings. Sprint name must be unique within this project.'}
          </DialogDescription>
        </DialogHeader>
        <form id="create-sprint-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-sprint-name">Sprint name</Label>
            <Input
              id="new-sprint-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-sprint-goal">Sprint goal</Label>
            <textarea
              id="new-sprint-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="What this sprint is aiming to deliver (optional)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-sprint-start">
                Start date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="new-sprint-start"
                type="date"
                value={start}
                onChange={(e) => onStartChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-sprint-end">End date</Label>
              <Input
                id="new-sprint-end"
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Defaults to {sprintLengthWeeks} week{sprintLengthWeeks === 1 ? '' : 's'} from start.
              </p>
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-sprint-form" disabled={submitting}>
            {submitting
              ? isEdit ? 'Saving…' : 'Creating…'
              : isEdit ? 'Save changes' : 'Create sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
