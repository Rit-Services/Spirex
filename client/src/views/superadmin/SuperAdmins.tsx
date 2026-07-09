// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { superadminApi } from '@/apis/superadminApi';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function errMsg(err: unknown): string | undefined {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error;
}

export function SuperAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setAdmins(await superadminApi.listAdmins());
    } catch {
      toast.error('Failed to load superadmins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRevoke = async (id: string, name: string) => {
    if (!window.confirm(`Revoke superadmin access for ${name}?`)) return;
    try {
      await superadminApi.revokeAdmin(id);
      toast.success('Superadmin access revoked');
      await load();
    } catch (e) {
      toast.error(errMsg(e) ?? 'Failed to revoke');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Superadmins</h1>
          <p className="text-sm text-muted-foreground">
            Platform operators with full control over every organization.
          </p>
        </div>
        <AddSuperAdminDialog onAdded={load} />
      </div>

      {loading && admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.name}
                  {a.id === user?.id ? (
                    <Badge variant="outline" className="ml-2">
                      you
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.email}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={admins.length <= 1}
                    onClick={() => onRevoke(a.id, a.name)}
                    title={admins.length <= 1 ? 'At least one superadmin is required' : undefined}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AddSuperAdminDialog({ onAdded }: { onAdded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await superadminApi.createAdmin({ name, email, password });
      toast.success('Superadmin created');
      reset();
      setOpen(false);
      await onAdded();
    } catch (err) {
      toast.error(errMsg(err) ?? 'Failed to create superadmin');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add superadmin</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add superadmin</DialogTitle>
          <DialogDescription>
            Creates a new platform operator account. They control all organizations — grant carefully.
          </DialogDescription>
        </DialogHeader>
        <form id="add-superadmin-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sa-name">Name</Label>
            <Input id="sa-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-email">Email</Label>
            <Input id="sa-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-password">Password</Label>
            <Input
              id="sa-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              aria-invalid={password.length > 0 && password.length < 8}
            />
            {password.length > 0 && password.length < 8 ? (
              <p className="text-xs text-destructive">
                Password must be at least 8 characters ({password.length}/8).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            )}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-superadmin-form"
            disabled={submitting || !name || !email || password.length < 8}
          >
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
