// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { EntitlementKey } from '@/types/organization';

interface EntitlementGuardProps {
  feature: EntitlementKey;
  /** Human label for the locked-state message, e.g. "Voice import". */
  label: string;
  children: ReactNode;
}

/**
 * Phase 13 — route-level gate for an org feature flag. When the active org has
 * the flag off, render a clear locked state instead of the feature (covers
 * direct URL navigation; the server also returns 403 independently). Keeps the
 * gated feature components untouched.
 */
export function EntitlementGuard({ feature, label, children }: EntitlementGuardProps) {
  const { hasEntitlement } = useAuth();
  if (hasEntitlement(feature)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h1 className="text-lg font-semibold">{label} isn't enabled</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        This feature isn't part of your organization's plan. Contact your platform administrator
        to enable it.
      </p>
    </div>
  );
}
