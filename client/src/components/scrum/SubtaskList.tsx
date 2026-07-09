// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { storyApi } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import { useAppSelector } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar } from '@/components/ui/avatar';
import { StoryTypeIcon } from './StoryTypeIcon';
import { useProjectStatuses } from '@/hooks/useProjectStatuses';
import { type Story, type StorySubtask, type StoryStatus } from '@/types/scrum';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  parent: Story;
  subtasks: StorySubtask[];
  onChanged: () => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function SubtaskList({ parent, subtasks, onChanged, canCreate, canEdit, canDelete }: Props) {
  const [addingMode, setAddingMode] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Use the RAW workflow rows so subtasks on a non-default column (e.g. a second
  // `in_progress` column) show/select the right column, not a collapsed label.
  const { rows: workflowRows, byCore: statusByCore } = useProjectStatuses(parent.projectId);
  const members = useAppSelector((s) => s.projects.currentMembers);
  const subtaskOptions = workflowRows;

  // The subtask's current column (statusId) → its select value and read-only
  // label, falling back to the first column for its core status.
  const rowIdForSub = (sub: StorySubtask) =>
    sub.statusId && subtaskOptions.some((w) => w.id === sub.statusId)
      ? sub.statusId
      : subtaskOptions.find((w) => w.coreStatus === sub.status)?.id ?? '';
  const labelForSub = (sub: StorySubtask) => {
    if (sub.statusId) {
      const row = workflowRows.find((w) => w.id === sub.statusId);
      if (row) return row.label;
    }
    return (
      workflowRows.find((w) => w.coreStatus === sub.status)?.label ??
      statusByCore[sub.status].label
    );
  };

  const done = subtasks.filter((s) => s.status === 'done').length;
  const total = subtasks.length;

  const toggleDone = async (sub: StorySubtask) => {
    const next: StoryStatus = sub.status === 'done' ? 'todo' : 'done';
    try {
      await storyApi.changeStatus(sub.id, next);
      onChanged();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const changeStatusRow = async (sub: StorySubtask, statusRowId: string) => {
    try {
      await storyApi.changeStatusRow(sub.id, statusRowId);
      onChanged();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const changeAssignee = async (sub: StorySubtask, assigneeId: string) => {
    try {
      await storyApi.update(sub.id, { assigneeId: assigneeId || null });
      onChanged();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const deleteSubtask = async (sub: StorySubtask) => {
    if (
      !window.confirm(
        `Delete subtask ${sub.key} "${sub.title}"? This can't be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(sub.id);
    try {
      await storyApi.remove(sub.id);
      toast.success(`Subtask ${sub.key} deleted`);
      onChanged();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setDeletingId(null);
    }
  };

  const createSubtask = async () => {
    if (!newTitle.trim()) return;
    setSubmitting(true);
    try {
      await storyApi.create({
        projectId: parent.projectId,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        assigneeId: newAssigneeId || null,
        parentStoryId: parent.id,
        type: 'task',
      });
      setNewTitle('');
      setNewDescription('');
      setNewAssigneeId('');
      setAddingMode(false);
      onChanged();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Subtasks{' '}
          {total > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              · {done}/{total} done
            </span>
          ) : null}
        </h3>
        {canCreate && !addingMode ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAddingMode(true)}
            aria-label="Add subtask"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add subtask
          </Button>
        ) : null}
      </header>

      {total === 0 && !addingMode ? (
        <p className="text-xs italic text-muted-foreground">No subtasks yet.</p>
      ) : null}

      {total > 0 ? (
        <ul className="max-h-52 divide-y overflow-y-auto rounded-md border bg-card">
          {subtasks.map((s) => {
            const isDone = s.status === 'done';
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
                data-subtask-key={s.key}
              >
                <button
                  type="button"
                  onClick={() => toggleDone(s)}
                  aria-label={isDone ? `Mark ${s.key} as To Do` : `Mark ${s.key} as done`}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={!canEdit}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <StoryTypeIcon type={s.type} />
                <span className="font-mono text-[11px] text-muted-foreground">{s.key}</span>
                <Link
                  to={`?story=${s.key}`}
                  className={cn(
                    'flex-1 truncate hover:underline',
                    isDone && 'text-muted-foreground line-through',
                  )}
                >
                  {s.title}
                </Link>
                {canEdit ? (
                  <Select value={rowIdForSub(s)} onValueChange={(v) => changeStatusRow(s, v)}>
                    <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {subtaskOptions.map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {labelForSub(s)}
                  </span>
                )}
                <Avatar name={s.assignee?.name ?? null} />
                {canEdit ? (
                  <Select
                    value={s.assigneeId ?? '__none__'}
                    onValueChange={(v) => changeAssignee(s, v === '__none__' ? '' : v)}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[100px] max-w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => deleteSubtask(s)}
                    disabled={deletingId === s.id}
                    aria-label={`Delete subtask ${s.key}`}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {addingMode ? (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="space-y-1">
            <Label htmlFor="subtask-title" className="text-xs">
              Title
            </Label>
            <Input
              id="subtask-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void createSubtask();
                } else if (e.key === 'Escape') {
                  setAddingMode(false);
                  setNewTitle('');
                  setNewDescription('');
                  setNewAssigneeId('');
                }
              }}
              placeholder="Subtask title"
              aria-label="New subtask title"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="subtask-description" className="text-xs">
              Description (optional)
            </Label>
            <textarea
              id="subtask-description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              aria-label="New subtask description"
              placeholder="Add context, reproduction steps, or acceptance notes…"
              className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Assignee (optional)
            </Label>
            <Select
              value={newAssigneeId || '__none__'}
              onValueChange={(v) => setNewAssigneeId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAddingMode(false);
                setNewTitle('');
                setNewDescription('');
                setNewAssigneeId('');
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={createSubtask} disabled={submitting || !newTitle.trim()}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
