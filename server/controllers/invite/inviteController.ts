// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { inviteService } from '../../services/invite/inviteService.js';
import { userService } from '../../services/user/userService.js';
import { config } from '../../config/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

export const inviteController = {
  /** Public — validates the token and returns enough for the accept page to
   *  render the right UI: the invitee's name/email, the target org (if any),
   *  and the mode ('set_password' for a new account, 'join_org' for a
   *  cross-org join that only needs consent). */
  async validate(req: Request, res: Response) {
    const invite = await inviteService.loadByToken(req.params.token);
    const mode = await inviteService.resolveMode(invite);
    res.json({
      user: { name: invite.user.name, email: invite.user.email },
      organization: invite.organization
        ? { id: invite.organization.id, name: invite.organization.name, slug: invite.organization.slug }
        : null,
      mode,
      expiresAt: invite.expiresAt.toISOString(),
    });
  },

  /** Public — consumes the invite (sets a password for new accounts; adds the
   *  org membership when applicable), then signs the user in via the cookie.
   *  Returns the joined org so the client can pin it as the active org. */
  async accept(req: Request, res: Response) {
    const { password } = req.body as { password?: string };
    const { user, organizationId } = await inviteService.accept(req.params.token, password);
    const token = userService.signToken(user);
    res.cookie(config.jwt.cookieName, token, {
      ...config.cookie,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ user: userService.publicProfile(user), organizationId });
  },

  // ── Authenticated in-app flow (bell → /invitations) ─────────────────────────

  /** The signed-in user's pending org invitations. */
  async listMine(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const invites = await inviteService.listPendingForUser(req.user.id);
    res.json({ invites });
  },

  /** Accept one's own invite from inside the app — returns the joined org so the
   *  client can pin it as the active org. */
  async acceptMine(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const { organizationId } = await inviteService.acceptOwn(req.params.id, req.user.id);
    res.json({ organizationId });
  },

  async declineMine(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    await inviteService.declineOwn(req.params.id, req.user.id);
    res.status(204).end();
  },
};
