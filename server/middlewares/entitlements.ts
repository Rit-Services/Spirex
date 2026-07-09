// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../utils/errorResponse.js';
import { getEntitlement, type EntitlementKey } from '../utils/entitlements.js';

/**
 * Gate a route behind a per-organization feature flag (Phase 13, Step 4).
 *
 * Relies on attachOrgContext (run by authHandler) having populated
 * req.orgContext.entitlements. Order of checks:
 *   1. superadmin → bypass (platform operator isn't bound by tenant flags).
 *   2. no active org → 403 (can't evaluate a flag without a tenant).
 *   3. flag off → 403 with a clear, user-facing message.
 */
export const requireEntitlement =
  (key: EntitlementKey) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ErrorResponse.unauthorized());
    if (req.user.isSuperAdmin) return next();

    const org = req.orgContext;
    if (!org) return next(ErrorResponse.forbidden('No active organization'));

    if (!getEntitlement(org.entitlements, key)) {
      return next(
        ErrorResponse.forbidden('This feature is not enabled for your organization'),
      );
    }
    next();
  };
