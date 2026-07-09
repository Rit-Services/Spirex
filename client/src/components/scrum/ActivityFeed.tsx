// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { storyApi } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import { Avatar } from '@/components/ui/avatar';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityEntry, ActivityEvent } from '@/types/scrum';

/**
 * Partial-by-design: not every `ActivityEvent` maps to a user-facing phrase
 * (some are internal/bookkeeping). Unknown events fall back to a generic
 * "performed <event>" line so the feed never crashes when the server grows
 * a new event type before the client ships the label.
 */
const EVENT_LABEL: Partial<Record<ActivityEvent, (e: ActivityEntry) => string>> = {
  created: () => 'created this story',
  // Prefer the server-resolved CURRENT column labels; fall back to the raw
  // core-status enum for older entries the server couldn't resolve.
  status_changed: (e) =>
    `moved ${e.fromLabel ?? e.fromValue ?? '?'} → ${e.toLabel ?? e.toValue ?? '?'}`,
  assigned: (e) => (e.toValue ? 'set an assignee' : 'cleared the assignee'),
  sprint_moved: (e) =>
    e.toValue ? 'moved this story to a sprint' : 'moved this story back to the backlog',
  epic_changed: () => 'changed the epic',
  commented: () => 'posted a comment',
  worklogged: (e) => `logged ${e.toValue ?? '?'} minutes`,
  subtask_added: (e) => `added subtask ${e.toValue ?? ''}`.trim(),
  linked: (e) => {
    const v = e.toValue ?? '';
    // stored as "<linkType>:<targetKey>" by the server
    const [type, key] = v.includes(':') ? v.split(':', 2) : [v, ''];
    const label = (type || 'linked').replace(/_/g, ' ');
    return key ? `${label} ${key}` : label;
  },
  unlinked: () => 'removed a link',
  worklog_deleted: (e) => `deleted a worklog${e.toValue ? ` (${e.toValue} min)` : ''}`,
  attachment_deleted: (e) => `deleted attachment ${e.toValue ?? ''}`.trim(),
  comment_deleted: () => 'deleted a comment',
  dates_changed: (e) => `changed dates from ${e.fromValue ?? '—'} to ${e.toValue ?? '—'}`,
  custom_field_changed: (e) => {
    const name = e.meta?.fieldName ?? 'a custom field';
    if (e.toValue === null) return `cleared ${name}`;
    return e.fromValue === null
      ? `set ${name} to ${e.toValue}`
      : `changed ${name} from ${e.fromValue} to ${e.toValue}`;
  },
};

function renderEvent(entry: ActivityEntry): string {
  const handler = EVENT_LABEL[entry.event];
  if (handler) return handler(entry);
  // Safe fallback for any event the client hasn't taught itself yet.
  return `performed ${String(entry.event).replace(/_/g, ' ')}`;
}

interface Props {
  storyId: string;
  /** Re-reads on change — bump from the panel after any mutation lands. */
  refreshKey?: number | string;
  /** Suppress the internal "Activity" heading when the parent renders its own
   *  (e.g. a collapsible "Activity" toggle in the story panel). */
  hideHeader?: boolean;
}

export function ActivityFeed({ storyId, refreshKey = 0, hideHeader = false }: Props) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await storyApi.activity(storyId);
        if (!cancelled) setEntries(rows);
      } catch (err) {
        if (!cancelled) toast.error(extractError(err).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId, refreshKey]);

  if (entries.length === 0) {
    return (
      <section>
        {hideHeader ? null : (
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4" />
            Activity
          </h3>
        )}
        <p className="text-xs italic text-muted-foreground">No activity recorded yet.</p>
      </section>
    );
  }

  return (
    <section>
      {hideHeader ? null : (
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" />
          Activity
        </h3>
      )}
      <ol className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {entries.map((e) => (
          <li key={e.id} className="flex items-start gap-3 text-sm">
            <Avatar name={e.actor?.name ?? null} />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{e.actor?.name ?? 'Someone'}</span>{' '}
                {renderEvent(e)} · {new Date(e.createdAt).toLocaleString()}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
