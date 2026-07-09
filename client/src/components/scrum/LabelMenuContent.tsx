// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Settings2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { createLabelThunk, fetchLabelsThunk } from '@/store/labelSlice';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface LabelMenuContentProps {
  projectId: string;
  /** Ids currently selected/attached — drives the checkmarks. */
  selectedIds: Set<string>;
  /** Toggle a label on/off. Receives the id and whether it's currently on. */
  onToggle: (labelId: string, currentlyOn: boolean) => void | Promise<void>;
  /** Id of a label mid-flight (shows it disabled). */
  busyId?: string | null;
  /** Opens the manage dialog. Omit to hide the "Manage labels" row. */
  onManage?: () => void;
}

/**
 * Shared body for every label popover (story detail, card inline, create
 * dialog): search box, the project's labels with checkmarks, a create-on-the-fly
 * row, and an optional "Manage labels" footer. Mounts only when its popover is
 * open, so fetching labels here never storms the board with one request per card.
 */
export function LabelMenuContent({
  projectId,
  selectedIds,
  onToggle,
  busyId,
  onManage,
}: LabelMenuContentProps) {
  const dispatch = useAppDispatch();
  const projectLabels = useAppSelector((s) => s.labels.byProject[projectId] ?? []);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (projectLabels.length === 0) void dispatch(fetchLabelsThunk(projectId));
    // Intentionally fetch once on open (mount); the guard keeps it cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projectLabels;
    return projectLabels.filter((l) => l.name.toLowerCase().includes(q));
  }, [projectLabels, query]);

  const trimmed = query.trim();
  const exactExists = projectLabels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !exactExists;

  const createAndSelect = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    const created = await dispatch(createLabelThunk({ projectId, input: { name: trimmed } }));
    setCreating(false);
    if (created.meta.requestStatus !== 'fulfilled') {
      toast.error((created.payload as string) ?? 'Failed to create label');
      return;
    }
    const label = (created.payload as { label: { id: string } }).label;
    setQuery('');
    await onToggle(label.id, false);
  };

  return (
    <>
      <div className="border-b p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void createAndSelect();
            }
          }}
          placeholder="Search or create…"
          className="h-8 text-sm"
        />
      </div>
      <div className="max-h-60 overflow-y-auto p-1">
        {filtered.map((l) => {
          const on = selectedIds.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => void onToggle(l.id, on)}
              disabled={busyId === l.id}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: l.color }}
                aria-hidden
              />
              <span className="flex-1 truncate">{l.name}</span>
              {on ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </button>
          );
        })}

        {canCreate ? (
          <button
            type="button"
            onClick={() => void createAndSelect()}
            disabled={creating}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="truncate">
              Create <span className="font-semibold">“{trimmed}”</span>
            </span>
          </button>
        ) : null}

        {filtered.length === 0 && !canCreate ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {projectLabels.length === 0 ? 'No labels yet — type to create one.' : 'No matches.'}
          </p>
        ) : null}
      </div>
      {onManage ? (
        <div className="border-t p-1">
          <button
            type="button"
            onClick={onManage}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Manage labels
          </button>
        </div>
      ) : null}
    </>
  );
}
