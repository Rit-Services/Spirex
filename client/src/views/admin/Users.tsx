// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  KeyRound,
  Mail,
  MoreHorizontal,
  Search,
  Send,
  UserCheck,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  disableUserThunk,
  enableUserThunk,
  fetchPendingInvitesThunk,
  fetchUsersThunk,
  resendInviteThunk,
  resetUserPasswordThunk,
  sendPasswordResetEmailThunk,
  updateGlobalRoleThunk,
} from '@/store/userSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CreateUserDialog } from '@/components/users/CreateUserDialog';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { User } from '@/types/user';
import type { PendingInvite } from '@/apis/userApi';

// One unified filter dimension that BOTH the stat cards and the tab strip
// write to — so clicking the "Admins" card and clicking the "Active" tab are
// the same kind of action and only one selection is ever active.
type StatusTab = 'all' | 'members' | 'admins' | 'active' | 'pending' | 'disabled';
type Role = 'admin' | 'member' | 'external';

// A unified directory entry — either an active/disabled member or an
// unaccepted invite — so the same table, search, filter and pagination apply
// to both. Members and invites have different actions but read the same.
type DirectoryRow =
  | { kind: 'member'; user: User }
  | { kind: 'invite'; invite: PendingInvite };

const PAGE_SIZE = 10;

export function Users() {
  const dispatch = useAppDispatch();
  const { list, pendingInvites, loading, error } = useAppSelector((s) => s.users);
  const { user: currentUser, activeOrg } = useAuth();

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StatusTab>('all');
  const [page, setPage] = useState(1);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    void dispatch(fetchUsersThunk());
    void dispatch(fetchPendingInvitesThunk());
  }, [dispatch]);

  // Phase 2: a tenant's role in THIS org is orgRole; globalRole is the legacy
  // mirror and is wrong for a multi-org user, so prefer orgRole everywhere.
  const roleOf = (u: User) => u.orgRole ?? 'member';
  const adminCount = list.filter((u) => roleOf(u) === 'admin').length;
  const activeCount = list.filter((u) => !u.disabledAt).length;
  const disabledCount = list.filter((u) => !!u.disabledAt).length;
  const seatsFull = !!activeOrg && list.length >= activeOrg.maxUsers;
  const seatPct = activeOrg ? Math.min(100, Math.round((list.length / activeOrg.maxUsers) * 100)) : 0;

  // ── Build the unified, filtered, sorted, paginated row set ──────────────
  const rows = useMemo<DirectoryRow[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (name: string, email: string) =>
      !q || name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    const byName = (a: string, b: string) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' });

    // Members: alphabetical by name, with disabled accounts sunk to the end so
    // the active roster reads top-to-bottom and dormant ones don't interleave.
    const memberRows: DirectoryRow[] = list
      .filter((u) => matches(u.name, u.email))
      .filter((u) =>
        tab === 'active'
          ? !u.disabledAt
          : tab === 'disabled'
            ? !!u.disabledAt
            : tab === 'admins'
              ? roleOf(u) === 'admin'
              : true,
      )
      .slice()
      .sort((a, b) => {
        const da = !!a.disabledAt;
        const db = !!b.disabledAt;
        if (da !== db) return da ? 1 : -1;
        return byName(a.name, b.name);
      })
      .map((user) => ({ kind: 'member', user }));

    const inviteRows: DirectoryRow[] = pendingInvites
      .filter((p) => matches(p.name, p.email))
      .slice()
      .sort((a, b) => byName(a.name, b.name))
      .map((invite) => ({ kind: 'invite', invite }));

    // Members-only filters never show invites.
    if (tab === 'active' || tab === 'disabled' || tab === 'admins' || tab === 'members') {
      return memberRows;
    }
    if (tab === 'pending') return inviteRows;
    return [...memberRows, ...inviteRows];
  }, [list, pendingInvites, query, tab]);

  const totalCount = list.length + pendingInvites.length;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, rows.length);

  // Reset to the first page whenever the filters change the result set.
  useEffect(() => {
    setPage(1);
  }, [query, tab]);

  // ── Handlers (unchanged behaviour, just relocated into the new UI) ───────
  const onDisable = async (id: string) => {
    const r = await dispatch(disableUserThunk(id));
    if (r.meta.requestStatus === 'fulfilled') toast.success('User disabled');
    else toast.error((r.payload as string) ?? 'Failed to disable');
  };

  const onEnable = async (id: string) => {
    const r = await dispatch(enableUserThunk(id));
    if (r.meta.requestStatus === 'fulfilled') toast.success('User enabled');
    else toast.error((r.payload as string) ?? 'Failed to enable');
  };

  const onReset = async (id: string) => {
    const r = await dispatch(resetUserPasswordThunk(id));
    if (r.meta.requestStatus === 'fulfilled') {
      const payload = r.payload as { tempPassword: string };
      toast.success(`Temporary password: ${payload.tempPassword}`, { duration: 15000 });
    } else {
      toast.error((r.payload as string) ?? 'Failed to reset password');
    }
  };

  const onResend = async (id: string, email: string) => {
    setResendingId(id);
    const r = await dispatch(resendInviteThunk(id));
    setResendingId(null);
    if (r.meta.requestStatus === 'fulfilled') {
      const payload = r.payload as { emailSent: boolean };
      toast.success(
        payload.emailSent
          ? `Invite re-sent to ${email}`
          : 'Invite refreshed — email not configured, share the link manually',
      );
    } else {
      toast.error((r.payload as string) ?? 'Failed to resend invite');
    }
  };

  const onRoleChange = async (id: string, nextRole: Role) => {
    const r = await dispatch(updateGlobalRoleThunk({ id, globalRole: nextRole }));
    if (r.meta.requestStatus === 'fulfilled') toast.success('Role updated');
    else toast.error((r.payload as string) ?? 'Failed to update role');
  };

  const onEmailReset = async (id: string, email: string) => {
    const r = await dispatch(sendPasswordResetEmailThunk(id));
    if (r.meta.requestStatus === 'fulfilled') {
      const payload = r.payload as { url: string; emailSent: boolean };
      if (payload.emailSent) {
        toast.success(`Reset link emailed to ${email}`);
      } else {
        await navigator.clipboard.writeText(payload.url).catch(() => {});
        toast.success('Reset link created — copied to clipboard (email not configured)');
      }
    } else {
      toast.error((r.payload as string) ?? 'Failed to send reset email');
    }
  };

  // One unified filter strip — the old stat cards (Members/Admins) and the
  // status tabs (Active/Pending/Disabled) folded into a single segmented
  // control so the same information isn't shown twice.
  const tabs: { key: StatusTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: totalCount },
    { key: 'members', label: 'Members', count: list.length },
    { key: 'admins', label: 'Admins', count: adminCount },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'pending', label: 'Pending', count: pendingInvites.length },
    { key: 'disabled', label: 'Disabled', count: disabledCount },
  ];

  const initialLoading = loading && totalCount === 0;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage members, roles, and invitations{activeOrg ? ` for ${activeOrg.name}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {activeOrg ? (
            <div className="min-w-[150px]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Seats</span>
                <span
                  className={cn(
                    'font-semibold',
                    seatsFull ? 'text-destructive' : 'text-foreground',
                  )}
                  title={seatsFull ? 'All seats are in use' : `${activeOrg.maxUsers - list.length} available`}
                >
                  {list.length} / {activeOrg.maxUsers}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    seatsFull ? 'bg-destructive' : seatPct >= 80 ? 'bg-amber-500' : 'bg-primary',
                  )}
                  style={{ width: `${seatPct}%` }}
                />
              </div>
            </div>
          ) : null}
          <CreateUserDialog />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* ── Unified filter strip + search ──────────────────────────────── */}
      {totalCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/40 p-1">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                    tab === key ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search users"
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full pl-8"
            />
          </div>
        </div>
      ) : null}

      {/* ── Directory ──────────────────────────────────────────────────── */}
      {initialLoading ? (
        <Card className="p-4">
          <UsersTableSkeleton />
        </Card>
      ) : totalCount === 0 ? (
        <EmptyState
          title="No users yet"
          description="Invite your first teammate to get started."
        />
      ) : (
        <Card className="animate-slide-up overflow-hidden motion-reduce:animate-none">
          {/* Column header */}
          <div className="grid grid-cols-[1fr_140px_120px_44px] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Member</span>
            <span>Role</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>

          <div className="divide-y">
            {pageRows.map((row) =>
              row.kind === 'member' ? (
                <MemberRow
                  key={row.user.id}
                  user={row.user}
                  isSelf={row.user.id === currentUser?.id}
                  role={roleOf(row.user)}
                  isLastAdmin={roleOf(row.user) === 'admin' && adminCount <= 1}
                  onRoleChange={onRoleChange}
                  onEmailReset={onEmailReset}
                  onReset={onReset}
                  onDisable={onDisable}
                  onEnable={onEnable}
                />
              ) : (
                <InviteRow
                  key={`invite-${row.invite.id}`}
                  invite={row.invite}
                  resending={resendingId === row.invite.id}
                  onResend={onResend}
                />
              ),
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No users match{' '}
              {query ? <span className="font-medium text-foreground">“{query}”</span> : 'this filter'}.
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of{' '}
                <span className="font-medium text-foreground">{rows.length}</span>
              </span>
              {totalPages > 1 ? (
                <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
              ) : null}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Member row ────────────────────────────────────────────────────────────
function MemberRow({
  user,
  isSelf,
  role,
  isLastAdmin,
  onRoleChange,
  onEmailReset,
  onReset,
  onDisable,
  onEnable,
}: {
  user: User;
  isSelf: boolean;
  role: Role;
  isLastAdmin: boolean;
  onRoleChange: (id: string, role: Role) => void;
  onEmailReset: (id: string, email: string) => void;
  onReset: (id: string) => void;
  onDisable: (id: string) => void;
  onEnable: (id: string) => void;
}) {
  const disabled = !!user.disabledAt;
  return (
    <div className="grid grid-cols-[1fr_140px_120px_44px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
      {/* Member identity */}
      <div className={cn('flex min-w-0 items-center gap-3', disabled && 'opacity-60')}>
        <Avatar name={user.name} size="md" />
        <div className="min-w-0">
          <Link
            to={`/admin/users/${user.id}`}
            className="block truncate text-sm font-medium hover:underline"
            aria-label={`View details for ${user.name}`}
          >
            {user.name}
            {isSelf ? <span className="ml-1.5 text-[11px] text-muted-foreground">(you)</span> : null}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Role */}
      <div>
        <Select
          value={role}
          onValueChange={(v) => onRoleChange(user.id, v as Role)}
          disabled={isLastAdmin}
        >
          <SelectTrigger
            className="h-8"
            title={
              isLastAdmin
                ? 'An organization must keep at least one admin — promote another user first'
                : role === 'external'
                  ? 'External / client — cannot create projects or import from JIRA'
                  : undefined
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="external">External</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Status */}
      <div>
        {disabled ? (
          <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive">
            <Ban className="h-3 w-3" />
            Disabled
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-400"
            title="Accepted the invite — active member of this organization"
          >
            <CheckCircle2 className="h-3 w-3" />
            Active
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Actions for ${user.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link to={`/admin/users/${user.id}`}>
                <UserCheck className="h-4 w-4" />
                View profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Password
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onEmailReset(user.id, user.email)}>
              <Mail className="h-4 w-4" />
              Email reset link
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onReset(user.id)}>
              <KeyRound className="h-4 w-4" />
              Temporary password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {disabled ? (
              <DropdownMenuItem onSelect={() => onEnable(user.id)}>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Enable account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={isSelf}
                onSelect={() => onDisable(user.id)}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="h-4 w-4" />
                Disable account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Invite row ────────────────────────────────────────────────────────────
function InviteRow({
  invite,
  resending,
  onResend,
}: {
  invite: PendingInvite;
  resending: boolean;
  onResend: (id: string, email: string) => void;
}) {
  const expires = new Date(invite.expiresAt);
  const expired = expires.getTime() < Date.now();
  return (
    <div className="grid grid-cols-[1fr_140px_120px_44px] items-center gap-3 bg-amber-500/[0.04] px-4 py-2.5 transition-colors hover:bg-amber-500/[0.08]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={invite.name} size="md" className="opacity-60 grayscale" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">{invite.name}</p>
          <p className="truncate text-xs text-muted-foreground">{invite.email}</p>
        </div>
      </div>

      <div>
        <span className="text-sm capitalize text-muted-foreground">{invite.role}</span>
      </div>

      <div>
        <Badge
          variant="outline"
          className={cn(
            'gap-1',
            expired
              ? 'border-muted-foreground/30 text-muted-foreground'
              : 'border-amber-300 text-amber-700 dark:border-amber-500/40 dark:text-amber-400',
          )}
          title={
            expired
              ? 'This invite has expired — resend to issue a fresh link'
              : `Invite expires ${expires.toLocaleDateString()}`
          }
        >
          <Clock3 className="h-3 w-3" />
          {expired ? 'Expired' : 'Pending'}
        </Badge>
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={resending}
          onClick={() => onResend(invite.id, invite.email)}
          aria-label={`Resend invite to ${invite.email}`}
          title="Resend invite email"
        >
          <Send className={cn('h-4 w-4', resending && 'animate-pulse')} />
        </Button>
      </div>
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────
function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pageItems(page, totalPages).map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? 'default' : 'outline'}
            size="icon"
            className="h-8 w-8 text-xs"
            onClick={() => onChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Compact page list: first, last, current ±1, with ellipses for the gaps.
function pageItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | 'ellipsis')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push('ellipsis');
  for (let p = left; p <= right; p++) items.push(p);
  if (right < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

// ── Loading skeleton ────────────────────────────────────────────────────────
function UsersTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5">
            <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
            <span className="block h-2.5 w-56 animate-pulse rounded bg-muted" />
          </div>
          <span className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
