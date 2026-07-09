// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useAppDispatch, useAppSelector } from '@/store';
import { loginThunk, logoutThunk, fetchMeThunk, updateProfileThunk } from '@/store/authSlice';
import { can, type Action } from '@/features/auth/permissions';
import type { EntitlementKey } from '@/types/organization';

export function useAuth() {
  const dispatch = useAppDispatch();
  const { user, activeOrg, memberships, status, error } = useAppSelector((s) => s.auth);

  return {
    user,
    // Phase 13: the user's active organization (null for the superadmin).
    activeOrg,
    // Phase 2: every org the user belongs to (drives the switcher). Empty for
    // the superadmin and for single-org users.
    memberships,
    status,
    error,
    isAuthenticated: status === 'authenticated' && !!user,
    // Phase 13: platform operator. Kept separate from can() (which is tenant
    // RBAC) — superadmin gates the /superadmin dashboard only.
    isSuperAdmin: user?.isSuperAdmin ?? false,
    login: (email: string, password: string) => dispatch(loginThunk({ email, password })),
    logout: () => dispatch(logoutThunk()),
    refresh: () => dispatch(fetchMeThunk()),
    updateProfile: (name: string) => dispatch(updateProfileThunk({ name })),
    // Phase 2: tenant permissions come from the ACTIVE org's role, NOT the
    // legacy user.globalRole (which is meaningless for a multi-org user). No
    // active org (e.g. superadmin) → no tenant permissions.
    can: (action: Action) => (activeOrg ? can({ globalRole: activeOrg.role }, action) : false),
    // Phase 13: is a per-org feature flag enabled for the active org? Superadmin
    // has no tenant org, so this is false for them (they don't run tenant imports).
    hasEntitlement: (key: EntitlementKey) => activeOrg?.entitlements?.[key] === true,
  };
}
