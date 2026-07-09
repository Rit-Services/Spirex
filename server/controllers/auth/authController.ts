// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { userService } from '../../services/user/userService.js';
import { config } from '../../config/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { userModel } from '../../models/user/user.js';

function headerStr(v: unknown): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === 'string' ? v : undefined;
}

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body as { email: string; password: string };
    const user = await userService.authenticate(email, password);
    const token = userService.signToken(user);

    res.cookie(config.jwt.cookieName, token, {
      ...config.cookie,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    // Fresh login: no per-tab selection yet, so resolve the default (first) org.
    const [org, memberships] = await Promise.all([
      userService.resolveActiveOrg(user.id),
      userService.listOrgs(user.id),
    ]);
    res.status(200).json({ user: userService.publicProfile(user), org, memberships });
  },

  async logout(_req: Request, res: Response) {
    res.clearCookie(config.jwt.cookieName, config.cookie);
    res.status(204).end();
  },

  async me(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const fresh = await userModel.findById(req.user.id);
    if (!fresh || fresh.disabledAt) throw ErrorResponse.unauthorized();
    // Per-tab active org follows the X-Org-Id header (falls back to first org).
    const activeOrgId = headerStr(req.headers['x-org-id']);
    const [org, memberships] = await Promise.all([
      userService.resolveActiveOrg(fresh.id, activeOrgId),
      userService.listOrgs(fresh.id),
    ]);
    res.json({ user: userService.publicProfile(fresh), org, memberships });
  },

  async changePassword(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const result = await userService.changePassword(req.user.id, currentPassword, newPassword);
    res.json(result);
  },

  /** Self-service: update the signed-in user's own display name. */
  async updateProfile(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const { name } = req.body as { name: string };
    const user = await userService.updateName(req.user.id, name);
    // Re-issue the JWT so the embedded name (used in req.user) stays current.
    const token = userService.signToken(user);
    res.cookie(config.jwt.cookieName, token, {
      ...config.cookie,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ user: userService.publicProfile(user) });
  },
};
