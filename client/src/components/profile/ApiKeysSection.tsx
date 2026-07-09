// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react';
import { apiKeysApi, type ApiKey } from '@/apis/apiKeysApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type KeyStatus = 'active' | 'revoked' | 'expired';

function statusOf(k: ApiKey): KeyStatus {
  if (k.revokedAt) return 'revoked';
  if (k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function StatusBadge({ status }: { status: KeyStatus }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>;
  if (status === 'expired') return <Badge variant="warning">Expired</Badge>;
  return <Badge variant="secondary">Revoked</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);

  const load = async () => {
    try {
      const list = await apiKeysApi.list();
      setKeys(list);
    } catch {
      toast.error('Failed to load API keys');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreated = (plaintext: string) => {
    setCreateOpen(false);
    setRevealKey(plaintext);
    void load();
  };

  const onRevoked = () => {
    setRevokeTarget(null);
    void load();
  };

  return (
    <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">API Keys</h2>
            <p className="text-xs text-muted-foreground">
              Generate keys to call the API from external services. Every action
              made with a key is attributed to your user.{' '}
              <Link
                to="/api-docs"
                className="inline-flex items-center gap-1 font-medium text-primary underline"
              >
                <BookOpen className="h-3 w-3" />
                Read the API docs
              </Link>
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          New key
        </Button>
      </div>

      {keys === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30 p-8 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">No API keys yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Create one to start calling the API from outside the browser.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Prefix</th>
                <th className="px-4 py-2.5 text-left font-medium">Status</th>
                <th className="px-4 py-2.5 text-left font-medium">Expires</th>
                <th className="px-4 py-2.5 text-left font-medium">Last used</th>
                <th className="px-4 py-2.5 text-left font-medium">Created</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((k) => {
                const status = statusOf(k);
                return (
                  <tr key={k.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {k.prefix}…
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(k.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(k.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(k.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === 'active' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setRevokeTarget(k)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onCreated}
      />

      <RevealKeyDialog
        plaintext={revealKey}
        onClose={() => setRevealKey(null)}
      />

      <RevokeKeyDialog
        target={revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onRevoked={onRevoked}
      />
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (plaintext: string) => void;
}) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setExpiresAt('');
      setSubmitting(false);
    }
  }, [open]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Date input gives "YYYY-MM-DD". Treat as end-of-day UTC so the key
      // stays valid through the chosen date.
      const expiresIso = expiresAt
        ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString()
        : null;
      const { plaintext } = await apiKeysApi.create({
        name: name.trim(),
        expiresAt: expiresIso,
      });
      toast.success('API key created');
      onCreated(plaintext);
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setSubmitting(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            The full key will be shown once. Save it somewhere safe — you won't
            be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <form id="create-api-key-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI deploy bot, Zapier integration"
              required
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-expires">Expires (optional)</Label>
            <Input
              id="api-key-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={todayIso}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for a non-expiring key.
            </p>
          </div>
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-api-key-form"
            disabled={submitting || !name.trim()}
          >
            {submitting ? 'Creating…' : 'Create key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealKeyDialog({
  plaintext,
  onClose,
}: {
  plaintext: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!plaintext) setCopied(false);
  }, [plaintext]);

  const copy = async () => {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      toast.success('Key copied to clipboard');
    } catch {
      toast.error('Failed to copy — copy it manually');
    }
  };

  return (
    <Dialog
      open={plaintext !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your new API key</DialogTitle>
          <DialogDescription>
            Copy and store this key now. For security it will not be shown
            again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This is the only time you'll see the full key. Treat it like a
            password.
          </p>
        </div>

        <div className="flex items-stretch gap-2">
          <Input
            readOnly
            value={plaintext ?? ''}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" />
                Copy
              </>
            )}
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevokeKeyDialog({
  target,
  onClose,
  onRevoked,
}: {
  target: ApiKey | null;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const onRevoke = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await apiKeysApi.revoke(target.id);
      toast.success('API key revoked');
      onRevoked();
    } catch {
      toast.error('Failed to revoke API key');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke API key</DialogTitle>
          <DialogDescription>
            Any external service still using <strong>{target?.name}</strong>{' '}
            will start getting 401 responses immediately. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="button"
            onClick={onRevoke}
            disabled={submitting}
          >
            {submitting ? 'Revoking…' : 'Revoke key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
