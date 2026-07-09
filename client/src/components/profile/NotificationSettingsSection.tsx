// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { notificationApi } from '@/apis/notificationApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  NotificationChannel,
  NotificationPreference,
  NotificationType,
} from '@/types/scrum';

interface TypeMeta {
  type: NotificationType;
  label: string;
  description: string;
  /** Channels this type can be delivered on. Mirrors channelsFor() on the server. */
  channels: NotificationChannel[];
}

const BOTH: NotificationChannel[] = ['in_app', 'email'];
const EMAIL_ONLY: NotificationChannel[] = ['email'];

interface Group {
  title: string;
  description: string;
  types: TypeMeta[];
}

// The grid, organised into groups. "Personal" reaches you directly; "Watching"
// covers tickets you watch; "Digests" is the periodic summary mail.
const GROUPS: Group[] = [
  {
    title: 'Personal',
    description:
      'Things that involve you directly — these reach you even when you are not watching the issue.',
    types: [
      {
        type: 'story_assigned',
        label: 'Assigned to an issue',
        description: 'An issue is assigned to you',
        channels: BOTH,
      },
      {
        type: 'story_reporter_changed',
        label: 'Made the reporter',
        description: 'You become the reporter of an issue',
        channels: BOTH,
      },
      {
        type: 'story_mentioned',
        label: 'Mentioned',
        description: 'You are @-mentioned in a comment',
        channels: BOTH,
      },
    ],
  },
  {
    title: 'Watching',
    description:
      'Updates on issues you watch via the eye icon. Reporter and assignee always watch their own issues.',
    types: [
      {
        type: 'story_commented',
        label: 'New comment',
        description: 'Someone comments on a watched issue',
        channels: BOTH,
      },
      {
        type: 'story_status_changed',
        label: 'Status change',
        description: 'A watched issue moves to a new column',
        channels: BOTH,
      },
      {
        type: 'story_priority_changed',
        label: 'Priority change',
        description: 'A watched issue priority is updated',
        channels: BOTH,
      },
      {
        type: 'story_updated',
        label: 'Other edits',
        description: 'Title, description, epic, sprint or points change',
        channels: BOTH,
      },
    ],
  },
  {
    title: 'Digests',
    description:
      'Periodic summary emails. Email only — these never appear in the in-app bell.',
    types: [
      {
        type: 'weekly_digest',
        label: 'Weekly digest',
        description: 'A weekly summary of project activity and your open issues',
        channels: EMAIL_ONLY,
      },
    ],
  },
];

const ALL_TYPES: TypeMeta[] = GROUPS.flatMap((g) => g.types);

const CHANNELS: { channel: NotificationChannel; label: string }[] = [
  { channel: 'in_app', label: 'In-app' },
  { channel: 'email', label: 'Email' },
];

const cellKey = (type: NotificationType, channel: NotificationChannel) => `${type}:${channel}`;

// Mirrors defaultEnabled() on the server: in-app is on for everything; email
// starts on only for personal events and the weekly digest — watching events
// are email-opt-in.
const EMAIL_DEFAULT_ON = new Set<NotificationType>([
  'story_assigned',
  'story_reporter_changed',
  'story_mentioned',
  'weekly_digest',
]);
const defaultEnabled = (type: NotificationType, channel: NotificationChannel) =>
  channel === 'in_app' || EMAIL_DEFAULT_ON.has(type);

/** Accessible on/off switch — the project has no shared Switch component yet. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** Build the lookup map for every valid cell, filling missing ones with the
 *  channel default (the server sends the full grid, so this is a safety net). */
function toMap(prefs: NotificationPreference[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const meta of ALL_TYPES) {
    for (const channel of meta.channels) {
      map.set(cellKey(meta.type, channel), defaultEnabled(meta.type, channel));
    }
  }
  for (const p of prefs) {
    const k = cellKey(p.type, p.channel);
    if (map.has(k)) map.set(k, p.enabled);
  }
  return map;
}

export function NotificationSettingsSection() {
  const [grid, setGrid] = useState<Map<string, boolean> | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const prefs = await notificationApi.getPreferences();
      const map = toMap(prefs);
      setGrid(map);
      setSavedSnapshot(JSON.stringify([...map.entries()].sort()));
    } catch {
      toast.error('Failed to load notification settings');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const dirty = useMemo(() => {
    if (!grid) return false;
    return JSON.stringify([...grid.entries()].sort()) !== savedSnapshot;
  }, [grid, savedSnapshot]);

  const toggle = (type: NotificationType, channel: NotificationChannel) => {
    setGrid((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      const k = cellKey(type, channel);
      next.set(k, !next.get(k));
      return next;
    });
  };

  const save = async () => {
    if (!grid) return;
    setSaving(true);
    try {
      const preferences: NotificationPreference[] = [];
      for (const meta of ALL_TYPES) {
        for (const channel of meta.channels) {
          preferences.push({
            type: meta.type,
            channel,
            enabled: grid.get(cellKey(meta.type, channel)) ?? defaultEnabled(meta.type, channel),
          });
        }
      }
      const fresh = await notificationApi.updatePreferences(preferences);
      const map = toMap(fresh);
      setGrid(map);
      setSavedSnapshot(JSON.stringify([...map.entries()].sort()));
      toast.success('Notification settings saved');
    } catch {
      toast.error('Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Bell className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              Choose how you get notified. In-app alerts are always on by default;
              emails start on only for personal events and the weekly digest —
              switch on emails for watched-issue updates if you want them.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {grid === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  {group.title}
                </h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Event</th>
                      {CHANNELS.map((c) => (
                        <th key={c.channel} className="px-4 py-2.5 text-center font-medium">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {group.types.map((meta) => (
                      <tr key={meta.type} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="font-medium">{meta.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {meta.description}
                          </div>
                        </td>
                        {CHANNELS.map((c) => {
                          const supported = meta.channels.includes(c.channel);
                          return (
                            <td key={c.channel} className="px-4 py-3 text-center">
                              {supported ? (
                                <div className="flex justify-center">
                                  <Toggle
                                    checked={
                                      grid.get(cellKey(meta.type, c.channel)) ??
                                      defaultEnabled(meta.type, c.channel)
                                    }
                                    onChange={() => toggle(meta.type, c.channel)}
                                    label={`${meta.label} — ${c.label}`}
                                  />
                                </div>
                              ) : (
                                <span
                                  className="text-muted-foreground/50"
                                  title="Not available for this notification"
                                >
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
