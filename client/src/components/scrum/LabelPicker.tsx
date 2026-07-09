// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { detachLabelThunk } from '@/store/storySlice';
import { Button } from '@/components/ui/button';
import { hexWithAlpha } from '@/lib/colorUtils';
import { toast } from 'sonner';
import type { Story } from '@/types/scrum';
import { LabelEditPopover } from './LabelEditPopover';

interface LabelPickerProps {
  story: Story;
  projectId: string;
  canEdit: boolean;
}

/**
 * The story detail panel's label field: attached labels as removable colored
 * pills plus an "Add" trigger that opens the shared label popover (toggle /
 * create-on-the-fly / manage). Read-only ("—") when the user can't edit.
 */
export function LabelPicker({ story, projectId, canEdit }: LabelPickerProps) {
  const dispatch = useAppDispatch();
  const [busyId, setBusyId] = useState<string | null>(null);
  const attached = story.labels ?? [];

  const detach = async (labelId: string) => {
    setBusyId(labelId);
    const r = await dispatch(detachLabelThunk({ id: story.id, labelId }));
    setBusyId(null);
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Failed to remove label');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {attached.map((l) => (
        <span
          key={l.id}
          className="inline-flex h-6 items-center gap-1 rounded-sm pl-2 pr-1 text-[11px] font-semibold"
          style={{ backgroundColor: hexWithAlpha(l.color, 0.16), color: l.color }}
        >
          {l.name}
          {canEdit ? (
            <button
              type="button"
              onClick={() => detach(l.id)}
              disabled={busyId === l.id}
              className="rounded-sm p-0.5 hover:bg-foreground/10 disabled:opacity-50"
              aria-label={`Remove label ${l.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}

      {attached.length === 0 && !canEdit ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : null}

      {canEdit ? (
        <LabelEditPopover story={story} projectId={projectId}>
          <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]">
            <Plus className="h-3 w-3" />
            {attached.length === 0 ? 'Add label' : 'Add'}
          </Button>
        </LabelEditPopover>
      ) : null}
    </div>
  );
}
