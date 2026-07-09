// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { can, type Action } from '../utils/permissions.js';
import { apiKeyService } from '../services/apiKey/apiKeyService.js';
import { attachOrgContext } from './orgContext.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  // Phase 2 (M4): globalRole removed — tenant authority is resolved per-request
  // from OrgMembership via req.orgContext. isSuperAdmin stays (platform flag).
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  // globalRole may still be present on tokens issued before M4 — it is simply
  // ignored now. isSuperAdmin is optional (absent on very old tokens).
  isSuperAdmin?: boolean;
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}

export async function authHandler(req: Request, _res: Response, next: NextFunction) {
  const bearer = extractBearer(req);
  if (bearer) {
    try {
      const user = await apiKeyService.resolveKey(bearer);
      if (!user) return next(ErrorResponse.unauthorized('Invalid or expired API key'));
      req.user = user;
      await attachOrgContext(req);
      return next();
    } catch (err) {
      return next(err);
    }
  }

  const token = req.cookies?.[config.jwt.cookieName];
  if (!token) return next(ErrorResponse.unauthorized('Not authenticated'));

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
  } catch {
    return next(ErrorResponse.unauthorized('Invalid or expired token'));
  }

  req.user = {
    id: decoded.sub,
    email: decoded.email,
    name: decoded.name,
    isSuperAdmin: decoded.isSuperAdmin ?? false,
  };

  // Org-context resolution can legitimately reject (suspended org) — keep that
  // 403 distinct from token-verification failures above.
  try {
    await attachOrgContext(req);
  } catch (err) {
    return next(err);
  }
  next();
}

export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const bearer = extractBearer(req);
  if (!bearer) {
    return next(ErrorResponse.unauthorized('API key required'));
  }
  try {
    const user = await apiKeyService.resolveKey(bearer);
    if (!user) return next(ErrorResponse.unauthorized('Invalid or expired API key'));
    req.user = user;
    await attachOrgContext(req);
    next();
  } catch (err) {
    next(err);
  }
}

// Phase 13: gate the platform-operator surface (/api/superadmin/*). The
// superadmin lives above every tenant, so this is a flat flag check rather than
// a can() lookup. authHandler must run first to populate req.user.
export const requireSuperAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(ErrorResponse.unauthorized());
  if (!req.user.isSuperAdmin) {
    return next(ErrorResponse.forbidden('Platform superadmin access required'));
  }
  next();
};

export const requirePermission = (action: Action) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(ErrorResponse.unauthorized());
  // A superadmin is a PLATFORM operator, never a tenant actor. requirePermission
  // gates only tenant routes (project/user/org/import management) — the platform
  // surface uses requireSuperAdmin instead — so reject superadmins here outright.
  // Note: can() short-circuits true for superadmins (it still serves direct
  // controller reads), which is exactly why route gating must block them first;
  // otherwise a superadmin sails through every tenant write check.
  if (req.user.isSuperAdmin) {
    return next(ErrorResponse.forbidden('Superadmins operate at the platform level and cannot perform tenant actions'));
  }
  if (
    !can(
      { userId: req.user.id, isSuperAdmin: req.user.isSuperAdmin, orgRole: req.orgContext?.role },
      action,
    )
  ) {
    return next(ErrorResponse.forbidden());
  }
  next();
};
