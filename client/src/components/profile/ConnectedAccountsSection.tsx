// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';
import { authApi, type SsoIdentity } from '@/apis/authApi';
import { extractError } from '@/config/httpClient';
import { urls } from '@/config/urls';

// Copy for link failures the SSO callback reports via ?sso_error=… (the OAuth
// dance leaves the SPA, so outcomes come back as redirect query params).
const LINK_ERROR_COPY: Record<string, string> = {
  already_linked: 'That Microsoft account is already connected to a different SPIREX user.',
  disabled: 'Your account is disabled.',
  sso_failed: 'Connecting Microsoft failed. Please try again.',
};

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

const PROVIDER_LABELS: Record<string, string> = { microsoft: 'Microsoft', google: 'Google' };

export function ConnectedAccountsSection() {
  const [providers, setProviders] = useState<string[]>([]);
  const [identities, setIdentities] = useState<SsoIdentity[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Provider currently being disconnected (drives the confirm dialog).
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    Promise.all([authApi.ssoProviders(), authApi.ssoIdentities()])
      .then(([p, ids]) => {
        setProviders(p);
        setIdentities(ids);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  // Surface the link outcome the SSO callback redirected back with, then
  // strip the params so a refresh doesn't re-toast.
  useEffect(() => {
    const linked = searchParams.get('sso') === 'linked';
    const error = LINK_ERROR_COPY[searchParams.get('sso_error') ?? ''];
    if (!linked && !error) return;
    if (linked) toast.success('Microsoft account connected');
    if (error) toast.error(error);
    const next = new URLSearchParams(searchParams);
    next.delete('sso');
    next.delete('sso_error');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeDialog = () => {
    setDisconnecting(null);
    setPassword('');
  };

  const onDisconnect = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!disconnecting) return;
    setBusy(true);
    try {
      await authApi.ssoDisconnect(disconnecting, password);
      setIdentities((ids) => ids.filter((i) => i.provider !== disconnecting));
      toast.success(`${PROVIDER_LABELS[disconnecting] ?? disconnecting} account disconnected`);
      closeDialog();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setBusy(false);
    }
  };

  // Nothing configured server-side and nothing linked → no section at all.
  if (!loaded || (providers.length === 0 && identities.length === 0)) return null;

  const rows = Array.from(new Set([...providers, ...identities.map((i) => i.provider)]));

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Link2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Connected Accounts</h2>
          <p className="text-xs text-muted-foreground">
            Sign in with these providers instead of your password
          </p>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {rows.map((provider) => {
          const identity = identities.find((i) => i.provider === provider);
          return (
            <div key={provider} className="flex items-center justify-between gap-3 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                {provider === 'microsoft' ? <MicrosoftLogo /> : <Link2 className="h-4 w-4" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{PROVIDER_LABELS[provider] ?? provider}</p>
                  {identity ? (
                    <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              {identity ? (
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="success">Connected</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setDisconnecting(provider)}
                  >
                    Disconnect
                  </Button>
                </div>
              ) : (
                // Full-page navigation: the OIDC flow leaves the SPA. The
                // explicit 'link' intent is what authorises the callback to
                // attach this provider to the signed-in user (the login page,
                // by contrast, omits it and only ever authenticates).
                <a
                  href={urls.auth.sso.start(provider, 'link')}
                  className="shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
                >
                  Connect
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Password-confirmed disconnect: proves the user keeps a working
          sign-in method once the provider is unlinked. */}
      <Dialog open={disconnecting !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onDisconnect} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                Disconnect {disconnecting ? (PROVIDER_LABELS[disconnecting] ?? disconnecting) : ''}?
              </DialogTitle>
              <DialogDescription>
                You'll no longer be able to sign in with this provider. Confirm your
                SPIREX password so you don't lose access to your account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="disconnectPassword" className="text-xs font-medium">
                Current Password
              </Label>
              <PasswordInput
                id="disconnectPassword"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy || password.length === 0}>
                {busy ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
