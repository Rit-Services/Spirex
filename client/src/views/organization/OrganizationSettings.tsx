// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Globe } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { fetchMeThunk } from '@/store/authSlice';
import { orgApi } from '@/apis/orgApi';
import type { Organization } from '@/types/organization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoUploader } from '@/components/organization/LogoUploader';

function errMsg(err: unknown): string | undefined {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error;
}

// Display the URL without its protocol; build a safe href that always has one.
const prettyUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const safeHref = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

export function OrganizationSettings() {
  const dispatch = useAppDispatch();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const o = await orgApi.getCurrent();
        setOrg(o);
        setName(o.name);
        setUrl(o.url ?? '');
      } catch {
        toast.error('Failed to load organization');
      }
    })();
  }, []);

  if (!org) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="h-44 animate-pulse rounded-xl bg-muted/60" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/60" />
      </div>
    );
  }

  const dirty = name.trim() !== org.name || (url.trim() || '') !== (org.url ?? '');

  const onSave = async () => {
    setSaving(true);
    try {
      const updated = await orgApi.update({ name: name.trim(), url: url.trim() || null });
      setOrg(updated);
      void dispatch(fetchMeThunk()); // refresh sidebar/navbar branding
      toast.success('Organization updated');
    } catch (e) {
      toast.error(errMsg(e) ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (file: File) => {
    setUploading(true);
    try {
      const updated = await orgApi.uploadLogo(file);
      setOrg(updated);
      void dispatch(fetchMeThunk());
      toast.success('Logo updated');
    } catch (e) {
      toast.error(errMsg(e) ?? 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ── Identity hero: gradient banner with the logo floating over it ── */}
      <Card className="enter overflow-hidden">
        <div className="relative h-24 bg-gradient-to-br from-primary/15 via-primary/[0.06] to-transparent">
          <div className="pointer-events-none absolute -right-6 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="px-6 pb-6">
          <div className="-mt-12 flex items-end gap-4">
            <LogoUploader name={org.name} logoUrl={org.logoUrl} uploading={uploading} onFile={onLogo} />
            <div className="min-w-0 pb-1">
              <h1 className="truncate text-2xl font-semibold leading-tight">{org.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  {org.slug}
                </span>
                {org.url ? (
                  <a
                    href={safeHref(org.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Globe className="h-3 w-3" />
                    {prettyUrl(org.url)}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground/70">
            Click the logo to preview it, or the camera button to change it — PNG, JPEG, WebP or GIF, up to 2 MB.
          </p>
        </div>
      </Card>

      {/* ── Editable details ────────────────────────────────────────────── */}
      <Card className="enter enter-1">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Your organization's name and website. The slug is set by the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-url">Website</Label>
              <Input
                id="org-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                maxLength={300}
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {dirty ? 'You have unsaved changes' : 'All changes saved'}
            </p>
            <Button onClick={onSave} disabled={!dirty || saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
