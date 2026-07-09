// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request } from 'express';
import { ErrorResponse } from '../utils/errorResponse.js';
import { orgMembershipModel } from '../models/org/orgMembership.js';
import { effectiveEntitlements, type Entitlements } from '../utils/entitlements.js';
import type { GlobalRole } from '../utils/permissions.js';

export interface OrgContext {
  orgId: string;
  // The user's role IN this org (membership-resolved). Available now; it becomes
  // the authoritative source for can() in the org-membership step.
  role: GlobalRole;
  // The active org's feature flags — read by requireEntitlement (Phase 13, Step 4).
  entitlements: Entitlements;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgContext?: OrgContext;
    }
  }
}

function headerStr(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Resolve the active organization for the signed-in user and attach
 * `req.orgContext`. Called from authHandler, so it covers every protected route.
 *
 * Resolution (best-effort during the Phase-13 transition):
 *   1. superadmin (platform operator) → no tenant context; skip.
 *   2. `X-Org-Id` header, when the user is actually a member of it → use it.
 *   3. otherwise default to the oldest membership ("first org"). This covers
 *      single-org users (their only org) AND multi-org users whose tab hasn't
 *      sent a header yet or sent a stale/invalid one — they act in their first
 *      org until the switcher (Step 2) pins a selection.
 *
 * A suspended org is a hard 403 (superadmins bypass via the skip above).
 */
export async function attachOrgContext(req: Request): Promise<void> {
  const user = req.user;
  if (!user || user.isSuperAdmin) return;

  const memberships = await orgMembershipModel.listForUser(user.id);
  if (memberships.length === 0) return;

  const headerOrg = headerStr(req.headers['x-org-id']);
  let chosen = headerOrg
    ? memberships.find((m) => m.organizationId === headerOrg)
    : undefined;
  // memberships are ordered oldest-first, so [0] is the stable "first org".
  if (!chosen) chosen = memberships[0];
  if (!chosen) return;

  if (chosen.organization.status === 'suspended') {
    throw ErrorResponse.forbidden('This organization is suspended');
  }
  req.orgContext = {
    orgId: chosen.organizationId,
    role: chosen.role as GlobalRole,
    // OSS: entitlements come from the environment (AI keys), not the stored
    // per-org JSON — see effectiveEntitlements().
    entitlements: effectiveEntitlements(),
  };
}
