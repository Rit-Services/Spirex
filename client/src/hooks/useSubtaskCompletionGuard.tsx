// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useState } from 'react';
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
import { toast } from 'sonner';
import type { StorySubtask } from '@/types/scrum';

/**
 * Soft guard for moving a PARENT issue to a Done column while it still has
 * open subtasks. It never blocks — it surfaces a warning and lets the user
 * choose to (a) cancel, (b) complete the parent on its own, or (c) complete
 * the parent AND drag its open subtasks along (the backend cascade).
 *
 * The parent-only escape hatch is intentional: completing a parent with open
 * subtasks is allowed, so the warning must not become a hard block on it.
 *
 * Call `requestComplete` (single issue) or `requestBulkComplete` (backlog
 * multi-select) from a status-change handler, and render `guardDialog`.
 */

interface RequestArgs {
  storyId: string;
  storyKey: string;
  storyTitle: string;
  /** True when the target column is a completion (done-category) column. */
  targetIsDone: boolean;
  /** Preloaded subtasks (e.g. the detail panel already has them). When absent
   *  the guard fetches the story to inspect subtask statuses. */
  subtasks?: StorySubtask[];
  /** `_count.subtasks` from a list row — lets the guard skip the fetch when the
   *  story has no children at all. */
  subtaskCount?: number;
  /** Runs when the move is cleared to proceed. `cascade` is true only when the
   *  user asked to carry the subtasks along. */
  onProceed: (cascade: boolean) => void | Promise<void>;
  /** Runs when the user cancels a warned move (e.g. to revert an optimistic UI). */
  onCancel?: () => void;
}

interface BulkRequestArgs {
  stories: { id: string; _count?: { subtasks: number } }[];
  targetIsDone: boolean;
  onProceed: (cascade: boolean) => void | Promise<void>;
  onCancel?: () => void;
}

interface PendingState {
  title: string;
  description: string;
  parentOnlyLabel: string;
  cascadeLabel: string;
  onProceed: (cascade: boolean) => void | Promise<void>;
  onCancel?: () => void;
}

export function useSubtaskCompletionGuard() {
  const [pending, setPending] = useState<PendingState | null>(null);
  const [busy, setBusy] = useState(false);

  const requestComplete = useCallback(async (args: RequestArgs) => {
    // Not a completion move → nothing to warn about.
    if (!args.targetIsDone) return args.onProceed(false);
    // Known childless (list row said so) and no preloaded list → skip the fetch.
    if (!args.subtasks && args.subtaskCount === 0) return args.onProceed(false);

    let subs = args.subtasks;
    if (!subs) {
      try {
        subs = (await storyApi.get(args.storyId)).subtasks ?? [];
      } catch (err) {
        // Can't verify → fail OPEN (let the move through) rather than trap work.
        toast.error(extractError(err).message);
        return args.onProceed(false);
      }
    }

    const incomplete = subs.filter((s) => s.status !== 'done').length;
    const total = subs.length;
    if (incomplete === 0) return args.onProceed(false);

    setPending({
      title: `Move ${args.storyKey} to Done?`,
      description:
        `${incomplete} of ${total} subtask${total === 1 ? '' : 's'} ` +
        `${incomplete === 1 ? "isn't" : "aren't"} done yet. You can complete ` +
        `${args.storyKey} on its own, or move it together with its subtasks.`,
      parentOnlyLabel: 'Move parent only',
      cascadeLabel: 'Move parent + subtasks',
      onProceed: args.onProceed,
      onCancel: args.onCancel,
    });
  }, []);

  const requestBulkComplete = useCallback(async (args: BulkRequestArgs) => {
    if (!args.targetIsDone) return args.onProceed(false);
    const candidates = args.stories.filter((s) => (s._count?.subtasks ?? 0) > 0);
    if (candidates.length === 0) return args.onProceed(false);

    let affected = 0;
    try {
      const fulls = await Promise.all(candidates.map((s) => storyApi.get(s.id)));
      affected = fulls.filter((f) => (f.subtasks ?? []).some((x) => x.status !== 'done')).length;
    } catch (err) {
      toast.error(extractError(err).message);
      return args.onProceed(false); // fail open
    }
    if (affected === 0) return args.onProceed(false);

    setPending({
      title: 'Move issues to Done?',
      description:
        `${affected} of the selected issue${affected === 1 ? ' has' : 's have'} ` +
        `subtasks that aren't done yet. Complete just the parents, or move them ` +
        `together with their subtasks.`,
      parentOnlyLabel: 'Parents only',
      cascadeLabel: 'Parents + subtasks',
      onProceed: args.onProceed,
      onCancel: args.onCancel,
    });
  }, []);

  const cancel = () => {
    if (busy) return;
    pending?.onCancel?.();
    setPending(null);
  };

  const run = async (cascade: boolean) => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.onProceed(cascade);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const guardDialog = (
    <Dialog
      open={!!pending}
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          <DialogDescription>{pending?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
            {pending?.parentOnlyLabel}
          </Button>
          <Button onClick={() => run(true)} disabled={busy}>
            {busy ? 'Moving…' : pending?.cascadeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestComplete, requestBulkComplete, guardDialog };
}
