// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch } from '@/store';
import { createStoryThunk } from '@/store/storySlice';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui/avatar';
import { StoryTypeIcon } from './StoryTypeIcon';
import { Plus, UserPlus, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { StoryStatus, StoryType } from '@/types/scrum';

/**
 * Jira-style inline "+ Create issue" row. Collapsed it's a single quiet button;
 * expanded it's a one-line form (type · title · assignee · Create).
 *
 * Reused in three places:
 *   - Backlog page: backlog section footer (no `sprintId` → lands in backlog).
 *   - Backlog page: each sprint lane footer (`sprintId` set, `status='todo'`).
 *   - Board page: the "To Do" column footer (`sprintId` + `status='todo'`).
 *
 * `flex-wrap` keeps the expanded form usable inside a narrow board column.
 */
export function InlineCreateStoryRow({
  projectId,
  members,
  sprintId = null,
  status,
  onCreated,
  className,
}: {
  projectId: string;
  members: { id: string; name: string }[];
  /** Create directly onto this sprint; omit/null → backlog. */
  sprintId?: string | null;
  /** Initial workflow status; sprint-targeted callers pass 'todo'. */
  status?: StoryStatus;
  onCreated?: () => void;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<StoryType>('story');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the title field focused for rapid sequential creation. `autoFocus`
  // only fires on mount, but after each submit the input stays mounted — and it
  // was blurred when `disabled` flipped during the async create. Re-focus
  // whenever the row is open and idle: covers initial open, post-success (clears
  // for the next issue), and post-failure (so the user can fix and retry).
  useEffect(() => {
    if (active && !submitting) inputRef.current?.focus();
  }, [active, submitting]);

  const assignee = members.find((m) => m.id === assigneeId) ?? null;
  const typeLabel: Record<StoryType, string> = { story: 'Story', task: 'Task', bug: 'Bug' };

  const submit = async () => {
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    const r = await dispatch(
      createStoryThunk({
        projectId,
        title: t,
        type,
        priority: 'medium',
        assigneeId: assigneeId || null,
        sprintId: sprintId ?? null,
        status,
      }),
    );
    setSubmitting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Story created');
      setTitle('');
      onCreated?.();
    } else {
      toast.error((r.payload as string) ?? 'Failed to create story');
    }
  };

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground hover:bg-muted/40 hover:text-foreground',
          className,
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        <span>Create issue</span>
      </button>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 px-3 py-2', className)}>
      {/* Type picker — icon-only trigger so the selected type is always visible */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Issue type: ${typeLabel[type]}`}
            title={typeLabel[type]}
            className="inline-flex h-8 w-8 items-center justify-center rounded border bg-background hover:bg-muted"
          >
            <StoryTypeIcon type={type} className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {(['story', 'task', 'bug'] as StoryType[]).map((t) => (
            <DropdownMenuItem
              key={t}
              onSelect={() => setType(t)}
              className="flex items-center gap-2"
            >
              <StoryTypeIcon type={t} />
              <span>{typeLabel[t]}</span>
              {type === t ? (
                <span className="ml-auto text-[10px] text-muted-foreground">current</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to be done?"
        maxLength={200}
        disabled={submitting}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setTitle('');
            setAssigneeId('');
            setActive(false);
          }
        }}
        className="h-8 min-w-[7rem] flex-1"
      />

      {/* Assignee picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={assignee ? `Assignee: ${assignee.name}` : 'Assign'}
            title={assignee ? assignee.name : 'Unassigned'}
            className="inline-flex h-8 items-center justify-center rounded border bg-background px-1 hover:bg-muted"
          >
            {assignee ? (
              <Avatar name={assignee.name} />
            ) : (
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() => setAssigneeId('')}
            className="flex items-center gap-2"
          >
            <UserX className="h-4 w-4 text-muted-foreground" />
            <span>Unassigned</span>
            {!assigneeId ? (
              <span className="ml-auto text-[10px] text-muted-foreground">current</span>
            ) : null}
          </DropdownMenuItem>
          {members.length > 0 ? <DropdownMenuSeparator /> : null}
          {members.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => setAssigneeId(m.id)}
              className="flex items-center gap-2"
            >
              <Avatar name={m.name} />
              <span className="truncate">{m.name}</span>
              {assigneeId === m.id ? (
                <span className="ml-auto text-[10px] text-muted-foreground">current</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" onClick={() => void submit()} disabled={submitting || !title.trim()}>
        {submitting ? 'Creating…' : 'Create'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setTitle('');
          setAssigneeId('');
          setActive(false);
        }}
        disabled={submitting}
      >
        Cancel
      </Button>
    </div>
  );
}
