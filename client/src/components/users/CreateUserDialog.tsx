// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState, type FormEvent } from 'react';
import { useAppDispatch } from '@/store';
import { createUserThunk, fetchPendingInvitesThunk, inviteMemberThunk } from '@/store/userSlice';
import type { InviteMemberResult } from '@/apis/userApi';
import { Button } from '@/components/ui/button';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type SetupMethod = 'invite' | 'password';
type Role = 'admin' | 'member' | 'external';

// Single-organization edition (D6): the multi-org "Invite existing user"
// (cross-org join) tab is gone — every addition is a new account in THIS org.
// Re-adding someone who was removed still works: the "Send invite email" path
// branches server-side on an existing account and re-invites it instead of
// creating a duplicate.

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="new-user-role">Role</Label>
      <Select value={value} onValueChange={(v) => onChange(v as Role)}>
        <SelectTrigger id="new-user-role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="member">Member</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="external">External (client)</SelectItem>
        </SelectContent>
      </Select>
      {value === 'external' ? (
        <p className="text-[11px] text-muted-foreground">
          External users can view projects they're added to but cannot create new projects or import
          from JIRA.
        </p>
      ) : null}
    </div>
  );
}

export function CreateUserDialog() {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [method, setMethod] = useState<SetupMethod>('invite');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setPassword('');
    setRole('member');
    setMethod('invite');
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    // "Send invite email": this is an INVITE, not an active member. The
    // membership is created only when they accept — until then they're
    // "pending", never "accepted". (Adding them to the roster now is the bug
    // we're avoiding.)
    if (method === 'invite') {
      const result = await dispatch(
        inviteMemberThunk({ email: email.trim(), name: name.trim(), globalRole: role }),
      );
      setSubmitting(false);
      if (result.meta.requestStatus === 'fulfilled') {
        const { invite, recipient } = result.payload as InviteMemberResult;
        toast.success(
          invite.emailSent
            ? `Invite emailed to ${recipient.email} — they'll set their own password`
            : `Invite created (email not configured) — share the link from the pending list`,
        );
        // Surface the new invite in the admin's pending list right away.
        void dispatch(fetchPendingInvitesThunk());
        reset();
        setOpen(false);
      } else {
        toast.error((result.payload as string) ?? 'Failed to send invite');
      }
      return;
    }

    // "Set temporary password": a genuinely active member with a working
    // credential — this one DOES belong in the roster immediately.
    const result = await dispatch(
      createUserThunk({ name, email, password, globalRole: role, mode: 'password' as const }),
    );
    setSubmitting(false);
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('User created');
      reset();
      setOpen(false);
    } else {
      toast.error((result.payload as string) ?? 'Failed to create user');
    }
  };

  const createSubmitDisabled =
    submitting || !name || !email || (method === 'password' && password.length < 8);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Add people</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people to this organization</DialogTitle>
          <DialogDescription>
            Create their account — email them a link to set their own password, or set a temporary
            one yourself.
          </DialogDescription>
        </DialogHeader>

        <form id="create-user-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Setup method</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={method === 'invite' ? 'default' : 'outline'}
                onClick={() => setMethod('invite')}
              >
                Send invite email
              </Button>
              <Button
                type="button"
                size="sm"
                variant={method === 'password' ? 'default' : 'outline'}
                onClick={() => setMethod('password')}
              >
                Set temporary password
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-name">Name</Label>
            <Input
              id="new-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {method === 'password' ? (
            <div className="space-y-2">
              <Label htmlFor="new-user-password">Temporary password</Label>
              <Input
                id="new-user-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                aria-invalid={password.length > 0 && password.length < 8}
              />
              {password.length > 0 && password.length < 8 ? (
                <p className="text-[11px] text-destructive">
                  Password must be at least 8 characters ({password.length}/8).
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Share it out-of-band; they can change it from their profile.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              We'll email a one-time link to set their own password. It expires in 7 days.
            </p>
          )}

          <RoleSelect value={role} onChange={setRole} />
        </form>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="create-user-form" disabled={createSubmitDisabled}>
            {submitting ? 'Sending…' : method === 'invite' ? 'Send invite' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
