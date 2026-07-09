// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Building2, CheckCheck, Inbox, Loader2, Search } from 'lucide-react';
import { notificationApi } from '@/apis/notificationApi';
import { typeIcon, timeAgo, TYPE_FILTER_OPTIONS } from '@/components/notifications/notificationMeta';
import { useOpenNotification } from '@/hooks/useOpenNotification';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AppNotification, NotificationType } from '@/types/scrum';

const PAGE_SIZE = 30;
// Sentinel for the Select's "no type filter" option (Radix Select forbids '').
const ALL_TYPES = 'all';

/**
 * The notification archive. The bell dropdown stays the quick-triage surface
 * (newest 40); this page walks the FULL history with read-state/type filters,
 * text search, and cursor-based "load more".
 */
export function Notifications() {
  const { memberships } = useAuth();
  const openNotification = useOpenNotification();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [orgFilter, setOrgFilter] = useState<string>(ALL_TYPES);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce the search box so we don't hit the server per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Org filter only matters for multi-org users (mirrors the bell). Applied
  // client-side on the loaded page — the server feed is already per-user.
  const canFilterOrg = memberships.length > 1;
  const orgNameOf = (id: string | null) =>
    (id ? memberships.find((m) => m.id === id)?.name : null) ?? null;

  const queryParams = useMemo(
    () => ({
      limit: PAGE_SIZE,
      unread: tab === 'unread',
      type: typeFilter === ALL_TYPES ? undefined : (typeFilter as NotificationType),
      q: debouncedSearch || undefined,
    }),
    [tab, typeFilter, debouncedSearch],
  );

  // (Re)load the first page whenever a server-side filter changes. The request
  // id guards against an older slow response landing after a newer one.
  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    void (async () => {
      try {
        const r = await notificationApi.list(queryParams);
        if (requestId.current !== id) return;
        setItems(r.notifications);
        setNextCursor(r.nextCursor);
        setUnreadTotal(r.unread);
      } catch {
        if (requestId.current === id) toast.error('Could not load notifications');
      } finally {
        if (requestId.current === id) setLoading(false);
      }
    })();
  }, [queryParams]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await notificationApi.list({ ...queryParams, cursor: nextCursor });
      setItems((prev) => [...prev, ...r.notifications]);
      setNextCursor(r.nextCursor);
      setUnreadTotal(r.unread);
    } catch {
      toast.error('Could not load more notifications');
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(
    () =>
      orgFilter === ALL_TYPES ? items : items.filter((n) => n.organizationId === orgFilter),
    [items, orgFilter],
  );

  const onRowClick = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await notificationApi.markRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnreadTotal((c) => Math.max(0, c - 1));
      } catch {
        // Navigation still proceeds; the row just stays unread.
      }
    }
    openNotification(n);
  };

  const markAll = async () => {
    try {
      await notificationApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadTotal(0);
      toast.success('All notifications marked read');
    } catch {
      toast.error('Could not mark notifications read');
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold">
            <Bell className="h-5 w-5 text-primary/70" />
            Notifications
            {unreadTotal > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-white">
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your full notification history — search and filter to find older updates.
          </p>
        </div>
        {unreadTotal > 0 ? (
          <Button variant="outline" size="sm" onClick={markAll}>
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        ) : null}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-card">
        {/* Read-state tabs */}
        <div className="flex rounded-lg border bg-muted/40 p-0.5">
          {(['all', 'unread'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                tab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>All types</SelectItem>
            {TYPE_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canFilterOrg ? (
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TYPES}>All organizations</SelectItem>
              {memberships.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, text, or story key…"
            className="h-8 pl-8 text-xs"
            aria-label="Search notifications"
          />
        </div>
      </div>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        {loading ? (
          <ul className="divide-y" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3.5">
                <span className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1 space-y-2">
                  <span
                    className="block h-3 animate-pulse rounded bg-muted"
                    style={{ width: `${72 - (i % 3) * 14}%` }}
                  />
                  <span className="block h-2.5 w-24 animate-pulse rounded bg-muted" />
                </span>
              </li>
            ))}
          </ul>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No notifications found</p>
            <p className="text-xs text-muted-foreground/60">
              {tab === 'unread'
                ? "You're all caught up."
                : 'Try different filters or a different search.'}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y">
              {visible.map((n) => {
                const orgLabel =
                  canFilterOrg && orgFilter === ALL_TYPES ? orgNameOf(n.organizationId) : null;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => void onRowClick(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60',
                        !n.read && 'bg-primary/5',
                      )}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                        {typeIcon(n.type)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-[13px] leading-snug', !n.read && 'font-semibold')}>
                          {n.title}
                        </p>
                        {n.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        ) : null}
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {n.storyKey ? (
                            <span className="rounded bg-muted px-1 py-px font-mono font-semibold">
                              {n.storyKey}
                            </span>
                          ) : null}
                          {orgLabel ? (
                            <span className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-full bg-muted px-1.5 py-px font-medium">
                              <Building2 className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{orgLabel}</span>
                            </span>
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

            {nextCursor ? (
              <div className="border-t bg-muted/20 p-3 text-center">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    'Load older notifications'
                  )}
                </Button>
              </div>
            ) : (
              <p className="border-t bg-muted/20 p-3 text-center text-[11px] text-muted-foreground/60">
                You've reached the end of your notification history.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
