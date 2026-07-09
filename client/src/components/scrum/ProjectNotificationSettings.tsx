// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  projectNotificationApi,
  type ProjectNotifPref,
  type ProjectNotificationEvent,
} from '@/apis/projectNotificationApi';

export const EVENTS: { key: ProjectNotificationEvent; label: string; hint: string }[] = [
  {
    key: 'status_changed',
    label: 'Status changes',
    hint: 'Emailed when an issue you’re involved in (assigned, reporting, or watching) moves between columns.',
  },
  {
    key: 'ticket_completed',
    label: 'Issue completed',
    hint: 'Emailed when an issue you’re involved in is moved into a Done column.',
  },
  {
    key: 'sprint_completed',
    label: 'Sprint completed',
    hint: 'Emailed when any sprint in this project is completed.',
  },
];

function buildMap(rows: ProjectNotifPref[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const r of rows) m[`${r.userId}:${r.event}`] = r.emailEnabled;
  return m;
}

/**
 * Fetches the project's email opt-ins and exposes an optimistic per-cell setter.
 * A lead (`canManageAll`) gets the whole member set; a member gets only their
 * own rows — the server scopes both the read and every save response, so this
 * hook never holds prefs the actor isn't allowed to see.
 */
export function useProjectNotificationPrefs(projectId: string | undefined) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [canManageAll, setCanManageAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoading(true);
    projectNotificationApi
      .list(projectId)
      .then((r) => {
        if (!alive) return;
        setPrefs(buildMap(r.preferences));
        setCanManageAll(r.canManageAll);
      })
      .catch(() => alive && toast.error('Could not load notification settings'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  const setCell = async (userId: string, event: ProjectNotificationEvent, next: boolean) => {
    if (!projectId) return;
    const key = `${userId}:${event}`;
    setPrefs((prev) => ({ ...prev, [key]: next })); // optimistic
    setSaving((prev) => new Set(prev).add(key));
    try {
      const updated = await projectNotificationApi.setForUser(projectId, userId, [
        { event, emailEnabled: next },
      ]);
      setPrefs(buildMap(updated)); // re-sync from the permission-scoped server set
    } catch {
      setPrefs((prev) => ({ ...prev, [key]: !next })); // revert
      toast.error('Could not save — reverted');
    } finally {
      setSaving((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }
  };

  return { prefs, canManageAll, loading, saving, setCell };
}

/** Minimal accessible on/off switch — no UI-kit dependency needed. */
export function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** Column header cell: event label + an info affordance carrying the full hint. */
export function EventHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-1" title={hint}>
      {label}
      <Info className="h-3 w-3 text-muted-foreground" aria-hidden />
    </span>
  );
}

/** The "soft path" explainer — progressive disclosure so experts skim and
 *  newcomers can read exactly how the (deliberately subtle) logic behaves. */
export function NotificationGuide({ open }: { open: boolean }) {
  if (!open) return null;
  return (
    <div className="rounded-md border bg-muted/40 p-4 text-xs leading-relaxed text-muted-foreground">
      <ul className="space-y-2">
        <li>
          <span className="font-medium text-foreground">One email, never two.</span> You’ll get a
          single email per update — even if you watch the issue <em>and</em> have it switched on
          here. We de-duplicate automatically.
        </li>
        <li>
          <span className="font-medium text-foreground">Turning a switch ON adds an email.</span> A
          project lead can switch one on for someone even when their personal settings have it off.
        </li>
        <li>
          <span className="font-medium text-foreground">Turning a switch OFF never silences</span> an
          email a person’s own settings already send — the personal choice always wins on whether
          mail goes out.
        </li>
        <li>
          <span className="font-medium text-foreground">Status &amp; completion emails</span> only
          reach someone for issues they’re involved in — assigned, reporting, or watching — not
          every issue in the project.
        </li>
        <li>
          <span className="font-medium text-foreground">Sprint completion</span> emails go to
          everyone in the project who switches it on.
        </li>
      </ul>
      <p className="mt-3 border-t pt-3">
        These are this project’s email switches. Personal, cross-project notifications live in{' '}
        <Link to="/profile" className="font-medium text-primary hover:underline">
          Profile settings
        </Link>
        .
      </p>
    </div>
  );
}
