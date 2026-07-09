// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { storyApi } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
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
import { LINK_LABELS, type LinkType, type Story } from '@/types/scrum';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceStory: Story;
  existingTargetIds: string[];
  onLinked: () => void;
}

const LINK_TYPES: LinkType[] = ['blocks', 'blocked_by', 'duplicates', 'duplicated_by', 'relates_to'];

export function LinkStoryDialog({
  open,
  onOpenChange,
  sourceStory,
  existingTargetIds,
  onLinked,
}: Props) {
  const [linkType, setLinkType] = useState<LinkType>('blocks');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Story[]>([]);
  const [targetId, setTargetId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setTargetId('');
    setLinkType('blocks');
  }, [open]);

  // Debounced search over the project. Include subtasks too — any story in the
  // project is linkable except the source itself and ones already linked.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const rows = await storyApi.list({
          projectId: sourceStory.projectId,
          search: search.trim() || undefined,
          includeSubtasks: 'true',
        });
        if (cancelled) return;
        setCandidates(rows);
      } catch (err) {
        if (!cancelled) toast.error(extractError(err).message);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, search, sourceStory.projectId]);

  const excluded = useMemo(() => new Set([sourceStory.id, ...existingTargetIds]), [
    sourceStory.id,
    existingTargetIds,
  ]);
  const filtered = candidates.filter((c) => !excluded.has(c.id)).slice(0, 20);

  const submit = async () => {
    if (!targetId) {
      toast.error('Pick a story to link to');
      return;
    }
    setSubmitting(true);
    try {
      await storyApi.createLink(sourceStory.id, { targetId, type: linkType });
      onLinked();
      onOpenChange(false);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link issue</DialogTitle>
          <DialogDescription>
            Connect <span className="font-mono">{sourceStory.key}</span> to another story in this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Relationship</Label>
            <Select value={linkType} onValueChange={(v) => setLinkType(v as LinkType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LINK_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="link-search">Find story</Label>
            <Input
              id="link-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or key"
              autoFocus
            />
          </div>

          <ul className="max-h-60 divide-y overflow-auto rounded-md border bg-card" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching stories.
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={targetId === c.id}
                    onClick={() => setTargetId(c.id)}
                    className={`flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                      targetId === c.id ? 'bg-accent' : ''
                    }`}
                  >
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{c.key}</span>
                    {/* min-w-0 lets this flex child shrink below its content's
                        intrinsic width so `truncate` actually clips. Without it
                        a long real-world title (prod data) forces the button —
                        and the whole dialog — wider than max-w-lg. */}
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !targetId}>
            {submitting ? 'Linking…' : 'Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
