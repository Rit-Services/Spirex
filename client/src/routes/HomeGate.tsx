// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { BrandLoader } from '@/components/BrandLoader';

/**
 * Front door at `/`.
 *   • While auth is resolving → brand loader (never redirect on unknown state —
 *     bouncing an authenticated user to /login makes Login bounce them straight
 *     back here, an infinite `/` ⇄ `/login` remount loop).
 *   • Authenticated           → superadmin to /superadmin, everyone else to
 *     /dashboard (mirrors the upstream RoleLanding).
 *   • Anonymous               → /login.
 *
 * We kick off the session check here because `/` doesn't live under AppLayout
 * (which is what triggers it for the app routes).
 */
export function HomeGate() {
  const { status, isAuthenticated, isSuperAdmin, refresh } = useAuth();

  useEffect(() => {
    if (status === 'idle') void refresh();
  }, [status, refresh]);

  if (status === 'idle' || status === 'loading') {
    return <BrandLoader label="Loading…" />;
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Navigate to={isSuperAdmin ? '/superadmin' : '/dashboard'} replace />;
}
