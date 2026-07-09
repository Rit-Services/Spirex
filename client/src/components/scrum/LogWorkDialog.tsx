// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { worklogApi } from '@/apis/worklogApi';
import { parseTimeToMinutes, TimeParseError, formatMinutes } from '@/utils/timeParser';
import { extractError } from '@/config/httpClient';
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

interface Props {
  storyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogWorkDialog({ storyId, open, onOpenChange, onLogged }: Props) {
  const [timeSpent, setTimeSpent] = useState('1h');
  const [date, setDate] = useState(todayIsoDate());
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTimeSpent('1h');
      setDate(todayIsoDate());
      setDescription('');
    }
  }, [open]);

  let preview = '';
  let previewOk = true;
  try {
    const minutes = parseTimeToMinutes(timeSpent);
    if (minutes == null || minutes <= 0) {
      preview = 'Enter a duration (e.g. 2h 30m)';
      previewOk = false;
    } else {
      preview = `= ${formatMinutes(minutes)} (${minutes} min)`;
    }
  } catch (err) {
    preview = err instanceof TimeParseError ? err.message : 'Invalid duration';
    previewOk = false;
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!previewOk) return;
    setSubmitting(true);
    try {
      // If the user picked today, use the current time so startedAt never lands
      // in the future (would be excluded by report queries with lte: now).
      // For past dates, anchor at noon local so the entry is unambiguously on
      // that calendar day regardless of timezone.
      const startedAt =
        date === todayIsoDate()
          ? new Date().toISOString()
          : new Date(`${date}T12:00:00`).toISOString();
      await worklogApi.create({
        storyId,
        timeSpent,
        startedAt,
        description: description || null,
      });
      toast.success(`Logged ${formatMinutes(parseTimeToMinutes(timeSpent))}`);
      onOpenChange(false);
      onLogged();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log work</DialogTitle>
          <DialogDescription>
            Record time against this story. Use the compact grammar: <code>2h 30m</code>,{' '}
            <code>1d</code>, <code>45m</code>.
          </DialogDescription>
        </DialogHeader>
        <form id="log-work-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="log-time">Time spent</Label>
            <Input
              id="log-time"
              value={timeSpent}
              onChange={(e) => setTimeSpent(e.target.value)}
              autoFocus
              required
            />
            <p className={previewOk ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
              {preview}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-date">Date started</Label>
            <Input
              id="log-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-description">Description</Label>
            <textarea
              id="log-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="log-work-form" disabled={submitting || !previewOk}>
            {submitting ? 'Logging…' : 'Log work'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
