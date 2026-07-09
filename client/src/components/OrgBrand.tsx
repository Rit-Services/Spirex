// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useAuth } from '@/hooks/useAuth';
import { API_BASE } from '@/config/urls';
import { cn } from '@/lib/utils';

/** Square org logo, falling back to the first initial on a muted tile. */
function OrgLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted',
        className,
      )}
    >
      {logoUrl ? (
        <img src={`${API_BASE}${logoUrl}`} alt="" className="h-full w-full object-contain" />
      ) : (
        <span className="text-xs font-bold text-muted-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/**
 * Navbar organization context — a plain, non-interactive brand.
 *
 * Single-organization edition (D6): this build runs exactly one org (the one
 * bootstrapped on first run; the server refuses to create a second), so there
 * is never anything to switch between and no switcher is rendered. The org
 * plumbing underneath (memberships, active-org resolution, org-scoped data)
 * is intact and untouched.
 *
 * Renders nothing when there's no active org (e.g. the platform superadmin).
 */
export function OrgBrand() {
  const { activeOrg } = useAuth();

  if (!activeOrg) return null;

  return (
    <div className="flex min-w-0 items-center gap-2.5" data-testid="org-brand">
      <OrgLogo name={activeOrg.name} logoUrl={activeOrg.logoUrl} className="h-8 w-8" />
      <span className="hidden min-w-0 truncate text-sm font-semibold sm:block">
        {activeOrg.name}
      </span>
    </div>
  );
}
