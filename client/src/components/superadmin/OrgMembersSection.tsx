// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAppDispatch } from '@/store';
import { fetchOrgThunk } from '@/store/superadminSlice';
import { superadminApi } from '@/apis/superadminApi';
import type { OrgMember, OrgRole } from '@/types/organization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function OrgMembersSection({ orgId }: { orgId: string }) {
  const dispatch = useAppDispatch();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [maxUsers, setMaxUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await superadminApi.listMembers(orgId);
      setMembers(res.members);
      setMaxUsers(res.maxUsers);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh both the roster and the parent detail's usage card after a change.
  const refresh = useCallback(async () => {
    await load();
    void dispatch(fetchOrgThunk(orgId));
  }, [load, dispatch, orgId]);

  const onRoleChange = async (userId: string, role: OrgRole) => {
    try {
      await superadminApi.setMemberRole(orgId, userId, role);
      toast.success('Role updated');
      await refresh();
    } catch (e) {
      toast.error(errMsg(e) ?? 'Failed to update role');
    }
  };

  const onRemove = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this organization? This frees a seat.`)) return;
    try {
      await superadminApi.removeMember(orgId, userId);
      toast.success('Member removed');
      await refresh();
    } catch (e) {
      toast.error(errMsg(e) ?? 'Failed to remove member');
    }
  };

  const full = members.length >= maxUsers && maxUsers > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${members.length}/${maxUsers} seats used`}
          </CardDescription>
        </div>
        <AddMemberDialog orgId={orgId} disabled={full} onAdded={refresh} />
      </CardHeader>
      <CardContent>
        {full ? (
          <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            Seat limit reached. Raise the limit above or remove a member to add more.
          </p>
        ) : null}

        {!loading && members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No members yet. Add the first admin so this organization can be used.
          </p>
        ) : (
          // Cap the height at ~10 rows; past that the body scrolls vertically
          // while the header stays pinned. max-h only kicks in once content
          // overflows, so small rosters render at their natural height.
          <Table wrapperClassName="max-h-[30rem] rounded-md border">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Select
                      value={m.orgRole}
                      onValueChange={(v) => onRoleChange(m.id, v as OrgRole)}
                    >
                      <SelectTrigger className="h-8 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="member">member</SelectItem>
                        <SelectItem value="external">external</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRemove(m.id, m.name)}
                      aria-label={`Remove ${m.name}`}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RoleSelect({ value, onChange }: { value: OrgRole; onChange: (r: OrgRole) => void }) {
  return (
    <div className="space-y-2">
      <Label>Role</Label>
      <Select value={value} onValueChange={(v) => onChange(v as OrgRole)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
          <SelectItem value="member">member</SelectItem>
          <SelectItem value="external">external</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// Provisioning dialog, mirroring the tenant-admin's CreateUserDialog but scoped
// to the org in the path (superadmin context): provisions a brand-new account in
// this org (temp password or set-password invite). Single-organization edition
// (D6): the multi-org "Invite existing user" (cross-org join) tab is gone.
function AddMemberDialog({
  orgId,
  disabled,
  onAdded,
}: {
  orgId: string;
  disabled: boolean;
  onAdded: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('admin');
  const [mode, setMode] = useState<'password' | 'invite'>('password');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setRole('admin');
    setMode('password');
    setPassword('');
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await superadminApi.addMember(orgId, {
        name,
        email,
        role,
        mode,
        password: mode === 'password' ? password : undefined,
      });
      if (mode === 'invite') {
        if (res.invite?.emailSent) toast.success(`Invite emailed to ${email}`);
        else {
          await navigator.clipboard.writeText(res.invite?.url ?? '').catch(() => {});
          toast.success('Invite created — link copied (email not configured)');
        }
      } else {
        toast.success('Member added');
      }
      reset();
      setOpen(false);
      await onAdded();
    } catch (err) {
      toast.error(errMsg(err) ?? 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const createSubmitDisabled =
    submitting || !name || !email || (mode === 'password' && password.length < 8);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled} title={disabled ? 'Seat limit reached' : undefined}>
          Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>
            Create a brand-new account in this organization.
          </DialogDescription>
        </DialogHeader>

        <form id="add-member-form" onSubmit={onSubmit} className="space-y-4">
          <p className="rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            We'll create their account in this org — email them a link to set their own password,
            or set a temporary one yourself.
          </p>

          <div className="space-y-2">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RoleSelect value={role} onChange={setRole} />
            <div className="space-y-2">
              <Label>Set up via</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'password' | 'invite')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="password">Set a password</SelectItem>
                  <SelectItem value="invite">Email an invite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === 'password' ? (
            <div className="space-y-2">
              <Label htmlFor="member-password">Temporary password</Label>
              <Input
                id="member-password"
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
          ) : (
            <p className="text-xs text-muted-foreground">
              We'll email a one-time link to set their own password. It expires in 7 days.
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-member-form" disabled={createSubmitDisabled}>
            {submitting ? 'Sending…' : mode === 'invite' ? 'Send invite' : 'Add member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Pull the server's error message out of an axios error for the toast.
function errMsg(err: unknown): string | undefined {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error;
}
