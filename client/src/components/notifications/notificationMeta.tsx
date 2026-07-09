// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import {
  MessageSquare,
  UserCheck,
  ArrowRightLeft,
  User,
  AtSign,
  Flag,
  Pencil,
  CalendarDays,
  Building2,
} from 'lucide-react';
import type { NotificationType } from '@/types/scrum';

// Shared between the bell dropdown and the full /notifications page so the
// two surfaces never drift on iconography or copy.

export function typeIcon(type: NotificationType) {
  switch (type) {
    case 'story_assigned':         return <UserCheck className="h-3.5 w-3.5 text-primary" />;
    case 'story_commented':        return <MessageSquare className="h-3.5 w-3.5 text-amber-500" />;
    case 'story_status_changed':   return <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-500" />;
    case 'story_reporter_changed': return <User className="h-3.5 w-3.5 text-violet-500" />;
    case 'story_mentioned':        return <AtSign className="h-3.5 w-3.5 text-sky-500" />;
    case 'story_priority_changed': return <Flag className="h-3.5 w-3.5 text-rose-500" />;
    case 'story_updated':          return <Pencil className="h-3.5 w-3.5 text-slate-500" />;
    // Email-only — never rendered in-app, but the switch stays exhaustive.
    case 'weekly_digest':          return <CalendarDays className="h-3.5 w-3.5 text-sky-500" />;
    case 'org_invite':             return <Building2 className="h-3.5 w-3.5 text-primary" />;
  }
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Options for the type filter on the /notifications page. `weekly_digest` is
 *  email-only and never stored as a row, so it isn't offered. */
export const TYPE_FILTER_OPTIONS: { value: NotificationType; label: string }[] = [
  { value: 'story_assigned',         label: 'Assigned' },
  { value: 'story_commented',        label: 'Comments' },
  { value: 'story_mentioned',        label: 'Mentions' },
  { value: 'story_status_changed',   label: 'Status changes' },
  { value: 'story_priority_changed', label: 'Priority changes' },
  { value: 'story_reporter_changed', label: 'Reporter changes' },
  { value: 'story_updated',          label: 'Other edits' },
  { value: 'org_invite',             label: 'Org invites' },
];
