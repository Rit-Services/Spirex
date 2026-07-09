// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { createStoryThunk, fetchStoriesThunk } from '@/store/storySlice';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchMembersThunk } from '@/store/projectSlice';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import {
  collectAttachmentIds,
  stringifyDescription,
  type TiptapDoc,
} from '@/utils/legacyDescription';
import { attachmentApi } from '@/apis/attachmentApi';
import { CustomFieldInput } from './CustomFieldInput';
import { LabelMultiSelect } from './LabelMultiSelect';
import { useCustomFields } from '@/hooks/useCustomFields';
import { toast } from 'sonner';
import type { CustomFieldPrimitive, Priority, StoryType } from '@/types/scrum';

interface Props {
  projectId: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateStoryDialog({ projectId, trigger, open: openProp, onOpenChange }: Props) {
  const dispatch = useAppDispatch();
  const epics = useAppSelector((s) => s.epics.byProject[projectId] ?? []);
  const members = useAppSelector((s) => s.projects.currentMembers);
  const activeFilters = useAppSelector((s) => s.stories.activeFilters);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  // Inline description media uploads immediately (before the story exists), so
  // every uploaded attachment id is tracked here. If the form is cancelled or
  // closed without a save, these are deleted so no orphan files are left behind.
  const uploadedIdsRef = useRef<Set<string>>(new Set());
  const deleteAttachments = (ids: string[]) => {
    for (const id of ids) void attachmentApi.remove(id).catch(() => {});
  };
  const discardUploads = () => {
    const ids = [...uploadedIdsRef.current];
    uploadedIdsRef.current.clear();
    deleteAttachments(ids);
  };

  const setOpen = (v: boolean) => {
    // Closing the dialog discards anything uploaded this session. On a
    // successful save the set was already reconciled+cleared, so this is a
    // no-op then; on cancel/X/overlay it frees the orphans.
    if (!v) discardUploads();
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  // Safety net for "left in the middle" — if this component unmounts (e.g. a
  // route change) while uploads are still pending, drop them too.
  useEffect(() => {
    const tracked = uploadedIdsRef;
    return () => {
      const ids = [...tracked.current];
      tracked.current.clear();
      for (const id of ids) void attachmentApi.remove(id).catch(() => {});
    };
  }, []);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<StoryType>('story');
  const [priority, setPriority] = useState<Priority>('medium');
  // Pre-fill 1 so the common case (forgotten estimate) lands at 1pt, matching the
  // server default. Users can still clear it or set their own value.
  const [points, setPoints] = useState<string>('1');
  const [epicId, setEpicId] = useState<string>('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [descriptionDoc, setDescriptionDoc] = useState<TiptapDoc | null>(null);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, CustomFieldPrimitive>>({});
  const [submitting, setSubmitting] = useState(false);
  const { fields: customFields } = useCustomFields(open ? projectId : undefined);

  useEffect(() => {
    if (!open) return;
    if (epics.length === 0) void dispatch(fetchEpicsThunk(projectId));
    if (members.length === 0) void dispatch(fetchMembersThunk(projectId));
  }, [open, dispatch, epics.length, members.length, projectId]);

  const reset = () => {
    setTitle('');
    setType('story');
    setPriority('medium');
    setPoints('1');
    setEpicId('');
    setLabelIds([]);
    setAssigneeId('');
    setDescription('');
    setDescriptionDoc(null);
    setStartDate('');
    setDueDate('');
    setCustomValues({});
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const descPayload =
      descriptionDoc != null ? stringifyDescription(descriptionDoc) : description || null;
    const r = await dispatch(
      createStoryThunk({
        projectId,
        title,
        type,
        priority,
        description: descPayload,
        storyPoints: points === '' ? null : Number(points),
        epicId: epicId || null,
        assigneeId: assigneeId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        labelIds: labelIds.length > 0 ? labelIds : undefined,
        customFields: Object.keys(customValues).length > 0 ? customValues : undefined,
      }),
    );
    setSubmitting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      // Reconcile inline uploads: the backend links the media still referenced
      // in the saved description to the new story; here we delete the ones that
      // were uploaded but later removed (backspaced) so they don't orphan.
      const referenced = new Set(collectAttachmentIds(descriptionDoc));
      const orphans = [...uploadedIdsRef.current].filter((id) => !referenced.has(id));
      uploadedIdsRef.current.clear();
      deleteAttachments(orphans);

      toast.success('Story created');
      reset();
      setOpen(false);
      if (activeFilters) void dispatch(fetchStoriesThunk(activeFilters));
    } else {
      toast.error((r.payload as string) ?? 'Failed');
    }
  };

  // In controlled mode (no trigger explicitly passed) we render no trigger at
  // all — the parent owns the open state, e.g. the global `c` shortcut. This
  // keeps a stray "Create story" button from appearing in the layout.
  const renderTrigger = !isControlled || trigger !== undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {renderTrigger ? (
        <DialogTrigger asChild>
          {trigger ?? <Button>Create issue</Button>}
        </DialogTrigger>
      ) : null}
      <DialogContent className="flex max-h-[90vh] flex-col">
        <DialogHeader>
          <DialogTitle>Create issue</DialogTitle>
          <DialogDescription>New issues land in the backlog by default.</DialogDescription>
        </DialogHeader>
        <form
          id="create-story-form"
          onSubmit={onSubmit}
          className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6"
        >
          <div className="space-y-2">
            <Label htmlFor="story-title">Title</Label>
            <Input id="story-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as StoryType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="story">Story</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="story-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="story-points">Story points</Label>
              <Input
                id="story-points"
                type="number"
                min={0}
                max={100}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="story-epic">Epic</Label>
              <Select
                value={epicId || '__none__'}
                onValueChange={(v) => setEpicId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(no epic)</SelectItem>
                  {epics.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.key} · {e.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="story-start-date">Start date</Label>
              <Input
                id="story-start-date"
                type="date"
                value={startDate}
                max={dueDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="story-due-date">Due date</Label>
              <Input
                id="story-due-date"
                type="date"
                value={dueDate}
                min={startDate || undefined}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="story-assignee">Assignee</Label>
            <Select
              value={assigneeId || '__none__'}
              onValueChange={(v) => setAssigneeId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.user.name} ({m.projectRole})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Labels</Label>
            <LabelMultiSelect projectId={projectId} value={labelIds} onChange={setLabelIds} />
          </div>
          {customFields.length > 0 ? (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">Custom fields</p>
              {customFields.map((f) => (
                <div key={f.id} className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2 [&>*]:min-w-0">
                  <Label className="text-xs">
                    {f.name}
                    {f.isRequired ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  <CustomFieldInput
                    field={f}
                    value={customValues[f.id] ?? null}
                    onCommit={(v) => setCustomValues((prev) => ({ ...prev, [f.id]: v }))}
                  />
                </div>
              ))}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Description</Label>
            <RichTextEditor
              value={description}
              onChange={(doc) => setDescriptionDoc(doc)}
              projectId={projectId}
              onUpload={(id) => uploadedIdsRef.current.add(id)}
              ariaLabel="Story description"
              minHeight="120px"
              placeholder="What needs doing?"
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-story-form" disabled={submitting || !title}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
