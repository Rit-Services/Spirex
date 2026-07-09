// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, Loader2, X } from 'lucide-react';
import { useAppDispatch } from '@/store';
import { fetchMeThunk } from '@/store/authSlice';
import { setActiveOrgId } from '@/config/activeOrg';
import { invitesApi, type PendingInvite } from '@/apis/invitesApi';
import { extractError } from '@/config/httpClient';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { toast } from 'sonner';

export function Invitations() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await invitesApi.listMine());
    } catch (err) {
      toast.error(extractError(err).message);
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAccept = async (inv: PendingInvite) => {
    setBusyId(inv.id);
    try {
      const { organizationId } = await invitesApi.accept(inv.id);
      if (organizationId) setActiveOrgId(organizationId);
      await dispatch(fetchMeThunk());
      toast.success(`Joined ${inv.organization?.name ?? 'organization'}`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(extractError(err).message);
      setBusyId(null);
    }
  };

  const onDecline = async (inv: PendingInvite) => {
    setBusyId(inv.id);
    try {
      await invitesApi.decline(inv.id);
      setInvites((prev) => prev?.filter((x) => x.id !== inv.id) ?? null);
      toast.success('Invitation declined');
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Invitations</h1>
        <p className="text-sm text-muted-foreground">
          Organizations that have invited you to join with this account.
        </p>
      </div>

      {invites === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : invites.length === 0 ? (
        <EmptyState
          title="No pending invitations"
          description="When an organization invites you, it'll show up here."
        />
      ) : (
        <ul className="space-y-3">
          {invites.map((inv) => {
            const busy = busyId === inv.id;
            const name = inv.organization?.name ?? 'Organization';
            return (
              <li
                key={inv.id}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{name}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Invited as <span className="capitalize">{inv.role}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDecline(inv)}
                    aria-label={`Decline invitation to ${name}`}
                  >
                    <X className="h-4 w-4" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onAccept(inv)}
                    aria-label={`Accept invitation to ${name}`}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Join
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
