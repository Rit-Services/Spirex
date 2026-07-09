// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Building2, ListFilter, Check, ArrowRight } from 'lucide-react';
import { notificationApi } from '@/apis/notificationApi';
import { typeIcon, timeAgo } from '@/components/notifications/notificationMeta';
import { useOpenNotification } from '@/hooks/useOpenNotification';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/types/scrum';

const POLL_MS = 15_000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  // null = "All organizations"; otherwise an org id to filter the feed by.
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  // 'unread' narrows the visible list; the badge stays the total either way.
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { memberships } = useAuth();
  const openNotification = useOpenNotification();

  // Only a multi-org user gets the filter UI + per-row org chips. A single-org
  // user has nothing to disambiguate, so the bell stays exactly as it was.
  const canFilter = memberships.length > 1;
  const orgNameOf = (id: string | null) =>
    (id ? memberships.find((m) => m.id === id)?.name : null) ?? null;

  const refresh = async () => {
    try {
      const { notifications: list, unread: count } = await notificationApi.list();
      setNotifications(list);
      setUnread(count);
    } catch {
      // silent — don't break the UI if notifications fail
    }
  };

  // Initial load + poll. Also refresh whenever the tab becomes visible or the
  // window regains focus — the most common case where a user expects to see
  // the count tick up (they were away in another tab/app and came back).
  // Browsers often throttle setInterval on background tabs, so the focus/
  // visibility hooks are not redundant with the timer.
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Close on outside click — except when the click landed on the Feedback
  // trigger. The Feedback button needs a single click to (a) close this
  // panel and (b) open the feedback flow. If we close synchronously on
  // mousedown the screenshot capture races with the unmount and the click
  // sometimes never reaches the Feedback button. Instead, we let the global
  // `feedback:open` event (emitted by the feedback plugin) close the panel
  // after capture starts.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (panelRef.current?.contains(target)) return;
      if (target?.closest?.('[data-feedback-trigger]')) return;
      // The filter dropdown renders in a portal outside the panel — ignore it.
      if (target?.closest?.('[data-notif-filter]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close cooperatively when the feedback flow begins, so the menu state
  // never gets in the way of submitting feedback.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('feedback:open', close);
    return () => window.removeEventListener('feedback:open', close);
  }, [open]);

  const openPanel = async () => {
    setOpen((v) => !v);
    if (!open) await refresh();
  };

  // The feed the user actually sees. Unread count stays the COMBINED total
  // (all orgs) by design — the filters only narrow the list, not the badge.
  const filtered = useMemo(
    () =>
      notifications
        .filter((n) => (orgFilter ? n.organizationId === orgFilter : true))
        .filter((n) => (readFilter === 'unread' ? !n.read : true)),
    [notifications, orgFilter, readFilter],
  );

  const handleClick = async (n: AppNotification) => {
    if (!n.read) {
      await notificationApi.markRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    // Deep-link (incl. the cross-org reload contract) lives in the shared hook.
    openNotification(n);
  };

  const markAll = async () => {
    await notificationApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  return (
    <div ref={panelRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={openPanel}
        aria-label="Notifications"
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-destructive  text-[7px] font-bold text-white leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-[60] mt-1 w-80 overflow-hidden rounded-xl border bg-card shadow-float animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
          <header className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </header>

          {/* Filter bar: All|Unread for everyone; the org dropdown only for
              multi-org users. Filters narrow the list; the unread badge stays
              the combined total. */}
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <div className="flex rounded-md border bg-background p-0.5">
              {(['all', 'unread'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setReadFilter(t)}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors',
                    readFilter === t
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {canFilter ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-notif-filter
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs font-medium',
                      'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    )}
                  >
                    <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="max-w-[140px] truncate">
                      {orgFilter ? orgNameOf(orgFilter) ?? 'Organization' : 'All organizations'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" data-notif-filter className="w-60">
                  <DropdownMenuLabel>Filter by organization</DropdownMenuLabel>
                  <DropdownMenuItem className="gap-2" onSelect={() => setOrgFilter(null)}>
                    <span className="flex-1">All organizations</span>
                    {orgFilter === null ? <Check className="h-4 w-4 text-primary" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {memberships.map((m) => (
                    <DropdownMenuItem key={m.id} className="gap-2" onSelect={() => setOrgFilter(m.id)}>
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{m.name}</span>
                      {orgFilter === m.id ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {readFilter === 'unread'
                ? "You're all caught up"
                : orgFilter
                  ? 'No notifications for this organization'
                  : 'No notifications yet'}
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y overflow-y-auto">
              {filtered.map((n) => {
                // Show which org a notification belongs to only when viewing the
                // combined feed — once filtered, every row is the same org.
                const orgLabel = canFilter && !orgFilter ? orgNameOf(n.organizationId) : null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                        !n.read && 'bg-primary/5',
                      )}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        {typeIcon(n.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-xs leading-snug', !n.read && 'font-semibold')}>
                          {n.title}
                        </p>
                        {n.body ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {n.body}
                          </p>
                        ) : null}
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {orgLabel ? (
                            <>
                              <span className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full bg-muted px-1.5 py-px font-medium">
                                <Building2 className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{orgLabel}</span>
                              </span>
                              <span className="text-muted-foreground/40">·</span>
                            </>
                          ) : null}
                          <span>{timeAgo(n.createdAt)}</span>
                        </div>
                      </div>
                      {!n.read ? (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Footer — the bell shows only the newest 40; the page is the archive. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="flex w-full items-center justify-center gap-1.5 border-t bg-muted/20 px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-muted/40"
          >
            View all notifications
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
