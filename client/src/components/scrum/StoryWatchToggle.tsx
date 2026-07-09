// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch } from '@/store';
import { unwatchStoryThunk, watchStoryThunk } from '@/store/storySlice';
import { storyApi } from '@/apis/storyApi';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Story, StoryWatcher } from '@/types/scrum';

/**
 * The watcher control in the story detail panel header. Shows the watcher
 * count; clicking opens a dialog that lists who is watching and lets the
 * current user watch / unwatch. Reporter + assignee are always watching
 * (server-side), so they always appear in the list.
 */
export function StoryWatchToggle({ story }: { story: Story }) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [watchers, setWatchers] = useState<StoryWatcher[] | null>(null);

  const watching = story.isWatching ?? false;
  const count = story.watcherCount ?? 0;

  const loadWatchers = async () => {
    setWatchers(null);
    try {
      setWatchers(await storyApi.listWatchers(story.id));
    } catch {
      toast.error('Failed to load watchers');
      setWatchers([]);
    }
  };

  const openDialog = () => {
    setOpen(true);
    void loadWatchers();
  };

  const toggle = async () => {
    setBusy(true);
    const r = await dispatch(
      watching ? unwatchStoryThunk(story.id) : watchStoryThunk(story.id),
    );
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Failed to update watch state');
    } else {
      // The list just changed (you added/removed yourself) — refresh it.
      await loadWatchers();
    }
    setBusy(false);
  };

  return (
    <>
      <Button
        variant={watching ? 'secondary' : 'ghost'}
        size="sm"
        onClick={openDialog}
        title="See who's watching this issue"
      >
        {watching ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        <span className="ml-1.5 tabular-nums">{count}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Watchers</DialogTitle>
            <DialogDescription>
              Everyone watching {story.key} is notified of every update to it.
            </DialogDescription>
          </DialogHeader>

          <Button
            variant={watching ? 'outline' : 'default'}
            onClick={toggle}
            disabled={busy}
            className="w-full"
          >
            {watching ? (
              <>
                <EyeOff className="mr-1.5 h-4 w-4" />
                Stop watching
              </>
            ) : (
              <>
                <Eye className="mr-1.5 h-4 w-4" />
                Watch this issue
              </>
            )}
          </Button>

          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {watchers === null ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
            ) : watchers.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                No one is watching this issue yet.
              </p>
            ) : (
              watchers.map((w) => (
                <div key={w.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                  <Avatar name={w.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{w.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
