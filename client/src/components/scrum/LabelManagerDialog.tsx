// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createLabelThunk,
  fetchLabelsThunk,
  removeLabelThunk,
  updateLabelThunk,
} from '@/store/labelSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { hexWithAlpha } from '@/lib/colorUtils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Same palette the server auto-assigns from (and EpicDialog uses) — keeps the
// recolor swatches in lockstep with the auto-color choices.
const LABEL_COLORS = [
  '#0052CC', '#00875A', '#6554C0', '#DE350B', '#FF8B00',
  '#00B8D9', '#FFAB00', '#5243AA', '#36B37E',
];

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Project label manager — rename, recolor, delete existing labels and add new
 *  ones. Deleting a label removes it from every ticket (server cascade). */
export function LabelManagerDialog({ projectId, open, onOpenChange }: Props) {
  const dispatch = useAppDispatch();
  const labels = useAppSelector((s) => s.labels.byProject[projectId] ?? []);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) void dispatch(fetchLabelsThunk(projectId));
  }, [open, dispatch, projectId]);

  const rename = async (id: string, name: string, current: string) => {
    const next = name.trim();
    if (!next || next === current) return;
    const r = await dispatch(updateLabelThunk({ projectId, id, input: { name: next } }));
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Failed to rename label');
    }
  };

  const recolor = async (id: string, color: string) => {
    const r = await dispatch(updateLabelThunk({ projectId, id, input: { color } }));
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Failed to recolor label');
    }
  };

  const remove = async (id: string, name: string) => {
    const r = await dispatch(removeLabelThunk({ projectId, id }));
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Failed to delete label');
    } else {
      toast.success(`Deleted “${name}”`);
    }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name || adding) return;
    setAdding(true);
    const r = await dispatch(createLabelThunk({ projectId, input: { name } }));
    setAdding(false);
    if (r.meta.requestStatus === 'fulfilled') {
      setNewName('');
    } else {
      toast.error((r.payload as string) ?? 'Failed to create label');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage labels</DialogTitle>
          <DialogDescription>
            Rename, recolor, or delete this project's labels. Deleting a label removes it from every
            issue.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {labels.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No labels yet. Add one below.
            </p>
          ) : (
            labels.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <span
                  className="inline-flex h-6 shrink-0 items-center rounded-sm px-1.5 text-[10px] font-semibold"
                  style={{ backgroundColor: hexWithAlpha(l.color, 0.16), color: l.color }}
                  title="Preview"
                >
                  Aa
                </span>
                <Input
                  defaultValue={l.name}
                  key={`${l.id}-${l.name}`}
                  onBlur={(e) => void rename(l.id, e.target.value, l.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className="h-8 flex-1 text-sm"
                  aria-label={`Rename ${l.name}`}
                />
                <div className="flex shrink-0 items-center gap-0.5">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void recolor(l.id, c)}
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-full ring-offset-1 transition hover:scale-110',
                        l.color.toLowerCase() === c.toLowerCase() && 'ring-2 ring-primary',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Set ${l.name} color ${c}`}
                      aria-pressed={l.color.toLowerCase() === c.toLowerCase()}
                    >
                      {l.color.toLowerCase() === c.toLowerCase() ? (
                        <Check className="h-3 w-3 text-white" />
                      ) : null}
                    </button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => void remove(l.id, l.name)}
                  aria-label={`Delete ${l.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="New label name…"
            className="h-9 flex-1"
          />
          <Button onClick={() => void add()} disabled={!newName.trim() || adding} className="gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
