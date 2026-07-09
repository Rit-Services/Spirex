// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useMemo, useState, type ReactNode } from 'react';
import { useAppDispatch } from '@/store';
import { attachLabelThunk, detachLabelThunk } from '@/store/storySlice';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import type { Story } from '@/types/scrum';
import { LabelMenuContent } from './LabelMenuContent';
import { LabelManagerDialog } from './LabelManagerDialog';

interface LabelEditPopoverProps {
  story: Story;
  projectId: string;
  children: ReactNode; // the trigger
  align?: 'start' | 'center' | 'end';
}

/**
 * A story-bound label popover: wrap any trigger and it opens the shared label
 * menu, attaching/detaching against THIS story (returns the hydrated story, so
 * the store patches in place). Reused by the detail panel and the card tiles so
 * labels behave identically wherever you edit them.
 */
export function LabelEditPopover({ story, projectId, children, align = 'start' }: LabelEditPopoverProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => new Set((story.labels ?? []).map((l) => l.id)),
    [story.labels],
  );

  const toggle = async (labelId: string, currentlyOn: boolean) => {
    setBusyId(labelId);
    const r = await dispatch(
      currentlyOn
        ? detachLabelThunk({ id: story.id, labelId })
        : attachLabelThunk({ id: story.id, labelId }),
    );
    setBusyId(null);
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Failed to update labels');
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align={align} className="w-64 p-0">
          <LabelMenuContent
            projectId={projectId}
            selectedIds={selectedIds}
            onToggle={toggle}
            busyId={busyId}
            onManage={() => {
              setOpen(false);
              setManageOpen(true);
            }}
          />
        </PopoverContent>
      </Popover>
      <LabelManagerDialog projectId={projectId} open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}
