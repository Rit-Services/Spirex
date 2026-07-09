// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Send the superadmin straight to the platform dashboard; everyone else to the
// tenant dashboard. Keeps the superadmin out of the tenant app entirely.
export function RoleLanding() {
  const { isSuperAdmin } = useAuth();
  return <Navigate to={isSuperAdmin ? '/superadmin' : '/dashboard'} replace />;
}
