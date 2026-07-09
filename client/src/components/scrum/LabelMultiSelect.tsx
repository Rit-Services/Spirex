// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchLabelsThunk } from '@/store/labelSlice';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { hexWithAlpha } from '@/lib/colorUtils';
import { LabelMenuContent } from './LabelMenuContent';

interface LabelMultiSelectProps {
  projectId: string;
  /** Selected label ids (controlled). */
  value: string[];
  onChange: (ids: string[]) => void;
}

/**
 * Controlled label picker for forms where the story doesn't exist yet (the
 * create dialog). Same popover/search/create UX as the story-bound picker, but
 * it edits an id array instead of attaching to a story. Newly created labels are
 * persisted immediately (they're project-scoped) and added to the selection.
 */
export function LabelMultiSelect({ projectId, value, onChange }: LabelMultiSelectProps) {
  const dispatch = useAppDispatch();
  const projectLabels = useAppSelector((s) => s.labels.byProject[projectId] ?? []);
  const [open, setOpen] = useState(false);

  // Need the label rows to render the selected pills (name + color).
  useEffect(() => {
    if (projectLabels.length === 0) void dispatch(fetchLabelsThunk(projectId));
  }, [dispatch, projectId, projectLabels.length]);

  const selectedIds = useMemo(() => new Set(value), [value]);
  const selected = projectLabels.filter((l) => selectedIds.has(l.id));

  const toggle = (labelId: string, currentlyOn: boolean) => {
    onChange(currentlyOn ? value.filter((id) => id !== labelId) : [...value, labelId]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((l) => (
        <span
          key={l.id}
          className="inline-flex h-6 items-center gap-1 rounded-sm pl-2 pr-1 text-[11px] font-semibold"
          style={{ backgroundColor: hexWithAlpha(l.color, 0.16), color: l.color }}
        >
          {l.name}
          <button
            type="button"
            onClick={() => toggle(l.id, true)}
            className="rounded-sm p-0.5 hover:bg-foreground/10"
            aria-label={`Remove label ${l.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]">
            <Plus className="h-3 w-3" />
            {selected.length === 0 ? 'Add label' : 'Add'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <LabelMenuContent projectId={projectId} selectedIds={selectedIds} onToggle={toggle} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
