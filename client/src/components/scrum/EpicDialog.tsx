// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { useAppDispatch } from '@/store';
import { createEpicThunk, updateEpicThunk } from '@/store/epicSlice';
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
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { stringifyDescription, type TiptapDoc } from '@/utils/legacyDescription';
import { toast } from 'sonner';
import type { Epic, EpicStatus } from '@/types/scrum';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const EPIC_COLORS = [
  '#0052CC', '#00875A', '#6554C0', '#DE350B', '#FF8B00',
  '#00B8D9', '#FFAB00', '#5243AA', '#36B37E',
];

interface EpicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  epic?: Epic | null; // undefined/null → create mode
}

export function EpicDialog({ open, onOpenChange, projectId, epic }: EpicDialogProps) {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionDoc, setDescriptionDoc] = useState<TiptapDoc | null>(null);
  const [color, setColor] = useState(EPIC_COLORS[0]);
  const [status, setStatus] = useState<EpicStatus>('open');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(epic?.title ?? '');
      setDescription(epic?.description ?? '');
      setDescriptionDoc(null);
      setColor(epic?.color ?? EPIC_COLORS[0]);
      setStatus(epic?.status ?? 'open');
    }
  }, [open, epic]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const descPayload =
      descriptionDoc != null ? stringifyDescription(descriptionDoc) : description || null;
    const payload = { title, description: descPayload, color, status };
    const r = epic
      ? await dispatch(updateEpicThunk({ id: epic.id, input: payload }))
      : await dispatch(createEpicThunk({ projectId, ...payload }));
    setSubmitting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(epic ? 'Epic updated' : 'Epic created');
      onOpenChange(false);
    } else {
      toast.error((r.payload as string) ?? 'Failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{epic ? 'Edit epic' : 'Create epic'}</DialogTitle>
          <DialogDescription>Epics group related stories across sprints.</DialogDescription>
        </DialogHeader>
        <form id="epic-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="epic-title">Title</Label>
            <Input id="epic-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <RichTextEditor
              value={description}
              onChange={(doc) => setDescriptionDoc(doc)}
              projectId={projectId}
              ariaLabel="Epic description"
              minHeight="120px"
              placeholder="What is this epic about?"
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {EPIC_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Pick color ${c}`}
                  aria-pressed={color === c}
                  className="h-7 w-7 rounded-md ring-offset-background transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EpicStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="epic-form" disabled={submitting || !title}>
            {submitting ? 'Saving…' : epic ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
