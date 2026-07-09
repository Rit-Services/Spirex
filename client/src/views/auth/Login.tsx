// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch } from '@/store';
import { clearAuthError } from '@/store/authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authApi } from '@/apis/authApi';
import { urls } from '@/config/urls';

// The SSO callback reports failures as redirect query codes (?sso_error=…)
// because the OAuth dance happens outside the SPA — map them to friendly copy.
const SSO_ERROR_COPY: Record<string, string> = {
  not_invited:
    'No SPIREX account matches that Microsoft account. SPIREX is invite-only — ask your admin for an invite.',
  email_unverified:
    "We couldn't verify the email on that Microsoft account. Sign in with your password, then connect Microsoft from your Profile page.",
  disabled: 'This account has been disabled. Contact your administrator.',
  already_linked: 'That Microsoft account is already connected to a different SPIREX user.',
  sso_failed: 'Microsoft sign-in failed. Please try again or use your password.',
};

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function Login() {
  const { login, status, error, isAuthenticated } = useAuth();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const expired = params.get('reason') === 'expired';
  const next = params.get('next');
  const ssoError = SSO_ERROR_COPY[params.get('sso_error') ?? ''] ?? null;
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [ssoProviders, setSsoProviders] = useState<string[]>([]);

  useEffect(() => { dispatch(clearAuthError()); }, [dispatch]);

  // Only render provider buttons the server is actually configured for.
  useEffect(() => {
    authApi.ssoProviders().then(setSsoProviders).catch(() => setSsoProviders([]));
  }, []);

  // Land on '/', where RoleLanding routes by role (superadmin → /superadmin,
  // tenant → /dashboard). Hardcoding /dashboard here is what dumped superadmins
  // onto the tenant dashboard with stale org context.
  if (isAuthenticated) return <Navigate to={next || '/'} replace />;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.meta.requestStatus === 'fulfilled') {
      toast.success('Welcome back');
      navigate(next || '/', { replace: true });
    }
  };

  return (
    <div>
      {/* Heading */}
      <div className="mb-7">
        <h2
          className="text-[1.35rem] font-bold tracking-tight"
          style={{ color: 'rgba(255,255,255,0.92)' }}
        >
          Welcome back
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.44)' }}>
          Sign in to continue to your workspace
        </p>
      </div>

      {ssoError ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border px-3 py-2.5 text-sm"
          style={{
            background: 'rgba(239,68,68,0.10)',
            borderColor: 'rgba(239,68,68,0.22)',
            color: '#f87171',
          }}
        >
          {ssoError}
        </p>
      ) : null}

      {expired ? (
        <p
          role="status"
          className="mb-4 rounded-lg border px-3 py-2.5 text-sm"
          style={{
            background: 'rgba(245,158,11,0.10)',
            borderColor: 'rgba(245,158,11,0.22)',
            color: '#fbbf24',
          }}
        >
          Your session has expired. Please sign in again to continue.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Email */}
        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-[#4f8fff]/50 focus-visible:ring-[#4f8fff]/20"
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <Label
            htmlFor="password"
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            Password
          </Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-11 border-white/10 bg-white/[0.06] text-white placeholder:text-white/25 focus-visible:border-[#4f8fff]/50 focus-visible:ring-[#4f8fff]/20"
          />
        </div>

        {/* Error */}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border px-3 py-2.5 text-sm"
            style={{
              background: 'rgba(239,68,68,0.10)',
              borderColor: 'rgba(239,68,68,0.22)',
              color: '#f87171',
            }}
          >
            {error}
          </p>
        ) : null}

        {/* Submit */}
        <Button
          type="submit"
          size="default"
          className="mt-1 h-11 w-full font-semibold"
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
              Signing in…
            </span>
          ) : (
            'Sign in →'
          )}
        </Button>
      </form>

      {ssoProviders.includes('microsoft') ? (
        <>
          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.10)' }} />
            <span className="text-[11px] font-medium uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
              or
            </span>
            <span className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.10)' }} />
          </div>

          {/* Plain anchor on purpose: the OIDC flow is a full-page redirect to
              the API, not an XHR — axios/CORS must stay out of the way. */}
          <a
            href={urls.auth.sso.start('microsoft')}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border text-sm font-semibold transition-colors hover:bg-white/[0.10]"
            style={{
              borderColor: 'rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.88)',
            }}
          >
            <MicrosoftLogo />
            Continue with Microsoft
          </a>
        </>
      ) : null}
    </div>
  );
}
