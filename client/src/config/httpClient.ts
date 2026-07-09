// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import axios, { type AxiosError } from 'axios';
import { getActiveOrgId } from './activeOrg';

// No `baseURL` on purpose: every request URL comes from the `urls` map
// (config/urls.ts), which already prepends API_BASE. Setting baseURL here as
// well would apply the prefix twice for any relative, non-empty API_BASE —
// that's the historical `/api/api/api/…` bug. urls.ts is the single place
// API_BASE is applied.
export const httpClient = axios.create({
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Phase 2: stamp every request with this tab's active org. The server resolves
// org context (and falls back to the user's first org if the header is absent
// or stale), so single-org users are unaffected.
httpClient.interceptors.request.use((config) => {
  const orgId = getActiveOrgId();
  if (orgId) config.headers.set('X-Org-Id', orgId);
  return config;
});

export interface ApiError {
  message: string;
  status: number;
  details?: unknown;
}

export function extractError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<{ error?: string; details?: unknown }>;
  const status = axiosErr.response?.status ?? 0;
  const message = axiosErr.response?.data?.error ?? axiosErr.message ?? 'Unexpected error';
  const details = axiosErr.response?.data?.details;
  return { message, status, details };
}

/**
 * Global 401 handler. The host page calls `installAuthInterceptor` once at
 * boot with hooks for "tear down auth state" + "navigate to login". When ANY
 * authenticated request comes back 401 we treat it as session expired:
 *   - reset the auth slice (so route guards immediately bounce to /login)
 *   - bounce to /login?reason=expired (the login screen shows a banner)
 *   - emit a single toast even if many 401s land at once
 *
 * `/auth/me` and `/auth/login` are skipped — `/auth/me` 401s are the normal
 * "no session yet" bootstrap path handled by `fetchMeThunk.rejected`, and
 * `/auth/login` 401s are bad-credentials feedback that the form already shows.
 */
let sessionExpiredHandled = false;

export interface AuthInterceptorHooks {
  onSessionExpired: () => void;
}

export function installAuthInterceptor({ onSessionExpired }: AuthInterceptorHooks) {
  httpClient.interceptors.response.use(
    (res) => res,
    (err: AxiosError) => {
      const status = err.response?.status;
      const url = err.config?.url ?? '';
      const isAuthProbe = /\/auth\/(me|login)\b/.test(url);
      if (status === 401 && !isAuthProbe && !sessionExpiredHandled) {
        sessionExpiredHandled = true;
        onSessionExpired();
        // Reset the latch on the next tick so future logins can re-trigger
        // it — covers the case where a user signs back in within the SPA.
        setTimeout(() => {
          sessionExpiredHandled = false;
        }, 1000);
      }
      return Promise.reject(err);
    },
  );
}
