// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, FolderKanban, Globe, Users, type LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  clearOrgDetail,
  fetchOrgThunk,
  reactivateOrgThunk,
  suspendOrgThunk,
  updateOrgThunk,
} from '@/store/superadminSlice';
import { superadminApi } from '@/apis/superadminApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoUploader } from '@/components/organization/LogoUploader';
import { ENTITLEMENTS, type Entitlements } from '@/types/organization';
import { OrgMembersSection } from '@/components/superadmin/OrgMembersSection';
import { cn } from '@/lib/utils';

const prettyUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const safeHref = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

export function OrganizationDetail() {
  const { id = '' } = useParams();
  const dispatch = useAppDispatch();
  const { current, detailLoading, detailError } = useAppSelector((s) => s.superadmin);

  // Local editable copy of the fields; seeded from the loaded org.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [url, setUrl] = useState('');
  const [maxUsers, setMaxUsers] = useState(0);
  const [entitlements, setEntitlements] = useState<Entitlements>({});
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    void dispatch(fetchOrgThunk(id));
    return () => {
      dispatch(clearOrgDetail());
    };
  }, [dispatch, id]);

  // Re-seed the form whenever the loaded org changes (initial load + after save).
  useEffect(() => {
    if (current) {
      setName(current.name);
      setSlug(current.slug);
      setUrl(current.url ?? '');
      setMaxUsers(current.maxUsers);
      setEntitlements({ ...current.entitlements });
    }
  }, [current]);

  if (detailLoading && !current) {
    return (
      <div className="space-y-6">
        <div className="h-44 animate-pulse rounded-xl bg-muted/60" />
        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="h-80 animate-pulse rounded-xl bg-muted/60" />
          <div className="h-80 animate-pulse rounded-xl bg-muted/60" />
        </div>
      </div>
    );
  }
  if (detailError && !current) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{detailError}</p>
        <Link to="/superadmin" className="text-sm text-primary hover:underline">
          ← Back to organizations
        </Link>
      </div>
    );
  }
  if (!current) return null;

  const dirty =
    name.trim() !== current.name ||
    slug.trim() !== current.slug ||
    (url.trim() || '') !== (current.url ?? '') ||
    maxUsers !== current.maxUsers ||
    ENTITLEMENTS.some((e) => (entitlements[e.key] ?? false) !== (current.entitlements[e.key] ?? false));

  const onSave = async () => {
    setSaving(true);
    const r = await dispatch(
      updateOrgThunk({
        id,
        input: { name: name.trim(), slug: slug.trim(), url: url.trim() || null, maxUsers, entitlements },
      }),
    );
    setSaving(false);
    if (r.meta.requestStatus === 'fulfilled') toast.success('Organization updated');
    else toast.error((r.payload as string) ?? 'Failed to update');
  };

  const onLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      await superadminApi.uploadOrgLogo(id, file);
      void dispatch(fetchOrgThunk(id)); // refresh logoUrl in the detail
      toast.success('Logo updated');
    } catch {
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const onToggleStatus = async () => {
    setStatusBusy(true);
    const suspend = current.status === 'active';
    const r = await dispatch(suspend ? suspendOrgThunk(id) : reactivateOrgThunk(id));
    setStatusBusy(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(suspend ? 'Organization suspended' : 'Organization reactivated');
    } else {
      toast.error((r.payload as string) ?? 'Failed to change status');
    }
  };

  const seatsFull = current.seatsUsed >= current.maxUsers;
  const suspended = current.status === 'suspended';

  return (
    <div className="space-y-6">
      <Link
        to="/superadmin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to organizations
      </Link>

      {/* ── Identity hero: gradient banner, logo floating over it, live stats ── */}
      <Card className="enter overflow-hidden">
        <div className="relative h-28 bg-gradient-to-br from-primary/15 via-primary/[0.06] to-transparent">
          <div className="pointer-events-none absolute -right-6 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
            <div className="flex min-w-0 items-end gap-4">
              <LogoUploader
                name={current.name}
                logoUrl={current.logoUrl}
                uploading={uploadingLogo}
                onFile={onLogo}
              />
              <div className="min-w-0 pb-1">
                <div className="flex items-center gap-2.5">
                  <h1 className="truncate text-2xl font-semibold leading-tight">{current.name}</h1>
                  <StatusBadge suspended={suspended} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {current.slug}
                  </span>
                  {current.url ? (
                    <a
                      href={safeHref(current.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <Globe className="h-3 w-3" />
                      {prettyUrl(current.url)}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pb-1">
              <StatPill
                icon={Users}
                label="Seats"
                value={`${current.seatsUsed}/${current.maxUsers}`}
                alert={seatsFull}
              />
              <StatPill icon={FolderKanban} label="Projects" value={current.projectCount} />
            </div>
          </div>
        </div>
      </Card>

      {/* ── Settings rail (left) + members & danger zone (right) ──────────────
          Default grid `items-stretch` makes both columns equal height; each
          column then anchors its last box to the bottom (left: the save footer
          via mt-auto; right: the danger card via mt-auto) so the two bottom
          boxes' edges land on the same line regardless of which side is taller. */}
      <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="enter enter-1 flex flex-col">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Identity, seat limit, and feature access.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-slug">Slug</Label>
                <Input
                  id="edit-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  maxLength={60}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-url">Website</Label>
                <Input
                  id="edit-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  maxLength={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-max-users">Seat limit</Label>
                <Input
                  id="edit-max-users"
                  type="number"
                  min={1}
                  max={100000}
                  value={maxUsers}
                  onChange={(e) => setMaxUsers(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Can't go below current usage ({current.seatsUsed}).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Features</Label>
              <div className="space-y-2">
                {ENTITLEMENTS.map((ent) => {
                  const on = entitlements[ent.key] ?? false;
                  return (
                    <label
                      key={ent.key}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors',
                        on ? 'border-primary/40 bg-primary/[0.04]' : 'hover:bg-accent/40',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-primary"
                        checked={on}
                        onChange={(e) =>
                          setEntitlements((prev) => ({ ...prev, [ent.key]: e.target.checked }))
                        }
                      />
                      <span>
                        <span className="font-medium">{ent.label}</span>
                        <span className="block text-xs text-muted-foreground">{ent.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto flex items-center justify-between border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {dirty ? 'You have unsaved changes' : 'All changes saved'}
              </p>
              <Button onClick={onSave} disabled={!dirty || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="enter enter-2">
            <OrgMembersSection orgId={current.id} />
          </div>

          {/* Danger zone — destructive-tinted so it reads as a deliberate action.
              mt-auto anchors it to the column bottom so its edge aligns with the
              Settings card's bottom across the gutter. */}
          <Card className={cn('enter enter-3 mt-auto', !suspended && 'border-destructive/30')}>
            <CardHeader>
              <CardTitle className={cn(!suspended && 'text-destructive')}>
                {suspended ? 'Reactivate organization' : 'Suspend organization'}
              </CardTitle>
              <CardDescription>
                {suspended
                  ? 'Reactivating restores access for every member of this organization.'
                  : 'Suspended organizations are blocked — members get a 403 on every request until reactivated.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant={suspended ? 'default' : 'destructive'}
                onClick={onToggleStatus}
                disabled={statusBusy}
              >
                {statusBusy
                  ? 'Working…'
                  : suspended
                    ? 'Reactivate organization'
                    : 'Suspend organization'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────────────────

function StatusBadge({ suspended }: { suspended: boolean }) {
  if (suspended) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Suspended
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Active
    </span>
  );
}

function StatPill({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 shadow-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-semibold leading-tight', alert && 'text-destructive')}>{value}</p>
      </div>
    </div>
  );
}
