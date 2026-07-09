// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function AdminGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (!can('user:manage')) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
