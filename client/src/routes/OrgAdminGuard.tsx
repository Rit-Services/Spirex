// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Gate the tenant org-settings page to org admins (org:manage capability).
export function OrgAdminGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('org:manage')) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
