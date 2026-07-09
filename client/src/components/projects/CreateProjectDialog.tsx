// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState, type FormEvent } from 'react';
import { useAppDispatch } from '@/store';
import { createProjectThunk } from '@/store/projectSlice';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Columns3, SquareKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectType } from '@/types/project';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function deriveKey(name: string): string {
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 4);
  return words.slice(0, 4).map((w) => w[0]).join('');
}

export function CreateProjectDialog() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [sprintLength, setSprintLength] = useState(2);
  const [type, setType] = useState<ProjectType>('scrum');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setKey('');
    setKeyTouched(false);
    setDescription('');
    setSprintLength(2);
    setType('scrum');
  };

  const onName = (v: string) => {
    setName(v);
    if (!keyTouched) setKey(deriveKey(v));
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const r = await dispatch(
      createProjectThunk({
        name,
        description: description || null,
        // Sprint length only matters for scrum; send the default for kanban.
        defaultSprintLengthWeeks: type === 'scrum' ? sprintLength : 2,
        key: key || undefined,
        type,
      }),
    );
    setSubmitting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Project created');
      const p = r.payload as { id: string };
      reset();
      setOpen(false);
      navigate(`/projects/${p.id}`);
    } else {
      toast.error((r.payload as string) ?? 'Failed to create project');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Projects group epics, stories, and sprints. You become its lead automatically.
          </DialogDescription>
        </DialogHeader>
        <form id="create-project-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Project type</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'scrum' as const, Icon: Columns3, title: 'Scrum', desc: 'Sprints, backlog & sprint board', disabled: false },
                // Kanban is temporarily disabled for creation — the continuous-flow
                // board lacks flow metrics (cycle/lead time, CFD) and explicit
                // column policies, so it isn't a faithful Kanban experience yet.
                // Existing kanban projects keep working; only new ones are blocked.
                { value: 'kanban' as const, Icon: SquareKanban, title: 'Kanban', desc: 'Continuous flow board, no sprints', disabled: true },
              ]).map(({ value, Icon, title, desc, disabled }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => !disabled && setType(value)}
                  disabled={disabled}
                  aria-pressed={type === value}
                  title={disabled ? 'Coming soon' : undefined}
                  className={cn(
                    'relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all',
                    disabled
                      ? 'cursor-not-allowed border-border bg-muted/30 opacity-60'
                      : type === value
                        ? 'border-primary/50 bg-primary/[0.06] ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/30 hover:bg-muted/40',
                  )}
                >
                  {disabled ? (
                    <span className="absolute right-2 top-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">This can&apos;t be changed later.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => onName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-key">Key</Label>
            <Input
              id="project-key"
              value={key}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
              }}
              pattern="[A-Z0-9]{2,10}"
              placeholder="e.g. KDG"
              maxLength={10}
            />
            <p className="text-xs text-muted-foreground">
              Auto-derived from the name. 2-10 uppercase letters/numbers.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              maxLength={2000}
            />
          </div>
          {type === 'scrum' ? (
            <div className="space-y-2">
              <Label>Default sprint length (weeks)</Label>
              <Select value={String(sprintLength)} onValueChange={(v) => setSprintLength(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 week</SelectItem>
                  <SelectItem value="2">2 weeks</SelectItem>
                  <SelectItem value="3">3 weeks</SelectItem>
                  <SelectItem value="4">4 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-project-form" disabled={submitting || !name}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
