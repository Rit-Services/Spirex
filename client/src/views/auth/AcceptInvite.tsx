// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch } from '@/store';
import { fetchMeThunk } from '@/store/authSlice';
import { inviteApi, type InviteSummary } from '@/apis/inviteApi';
import { setActiveOrgId } from '@/config/activeOrg';
import { extractError } from '@/config/httpClient';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Phase = 'loading' | 'ready' | 'invalid' | 'submitting';

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [summary, setSummary] = useState<InviteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      setError('Missing invite token');
      return;
    }
    let cancelled = false;
    inviteApi
      .validate(token)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        setPhase('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractError(err).message);
        setPhase('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Shared completion: consume the invite, pin the joined org for this tab, load
  // the session, and land on the dashboard.
  const finishAccept = async (pwd?: string) => {
    setPhase('submitting');
    try {
      const result = await inviteApi.accept(token, pwd);
      if (result.organizationId) setActiveOrgId(result.organizationId);
      await dispatch(fetchMeThunk());
      toast.success(summary?.mode === 'join_org' ? 'Joined organization' : 'Welcome aboard');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(extractError(err).message);
      setPhase('ready');
    }
  };

  const onSubmitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    await finishAccept(password);
  };

  if (phase === 'loading') {
    return (
      <div>
        <h2 className="text-[1.35rem] font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
          Checking invite…
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.44)' }}>
          One moment.
        </p>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div>
        <h2 className="text-[1.35rem] font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
          Invite unavailable
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.62)' }}>
          {error ?? 'This invite is invalid, expired, or already used.'}
        </p>
        <Button className="mt-6 h-11 w-full font-semibold" onClick={() => navigate('/login', { replace: true })}>
          Go to sign in
        </Button>
      </div>
    );
  }

  const orgName = summary?.organization?.name;

  // ── Cross-org join: existing account, one-click consent, no password ────────
  if (summary?.mode === 'join_org') {
    return (
      <div>
        <div className="mb-7">
          <h2 className="text-[1.35rem] font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
            Join {orgName ?? 'this organization'}
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>
            You've been invited to join {orgName ? <strong>{orgName}</strong> : 'a new organization'} with
            your existing SPIREX account{summary.user.email ? ` (${summary.user.email})` : ''}.
          </p>
        </div>
        <Button
          className="h-11 w-full font-semibold"
          disabled={phase === 'submitting'}
          onClick={() => finishAccept()}
        >
          {phase === 'submitting' ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              Joining…
            </span>
          ) : (
            `Join ${orgName ?? 'organization'} →`
          )}
        </Button>
      </div>
    );
  }

  // ── New account: set a password ─────────────────────────────────────────────
  return (
    <div>
      <div className="mb-7">
        <h2 className="text-[1.35rem] font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
          Welcome{summary ? `, ${summary.user.name}` : ''}
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.52)' }}>
          Set a password to finish setting up your SPIREX account
          {orgName ? <> and join <strong>{orgName}</strong></> : ''}
          {summary ? ` (${summary.user.email})` : ''}.
        </p>
      </div>

      <form onSubmit={onSubmitPassword} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="invite-password" className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.52)' }}>
            New password
          </Label>
          <PasswordInput
            id="invite-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="h-11 border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-[#4f8fff]/50 focus-visible:ring-[#4f8fff]/20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-confirm" className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.52)' }}>
            Confirm password
          </Label>
          <PasswordInput
            id="invite-confirm"
            autoComplete="new-password"
            placeholder="Repeat password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="h-11 border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-[#4f8fff]/50 focus-visible:ring-[#4f8fff]/20"
          />
        </div>

        <Button type="submit" size="default" className="mt-1 h-11 w-full font-semibold" disabled={phase === 'submitting'}>
          {phase === 'submitting' ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              Setting up…
            </span>
          ) : (
            'Set password & sign in →'
          )}
        </Button>
      </form>
    </div>
  );
}
