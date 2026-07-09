// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';
import { userModel } from '../../models/user/user.js';
import { userService } from '../../services/user/userService.js';
import { ssoService, SsoError, isMicrosoftConfigured } from '../../services/sso/ssoService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import logger from '../../utils/logger.js';

/**
 * Browser-redirect endpoints for SSO. Unlike the JSON API, failures here must
 * land the user somewhere visible, so every error becomes a redirect to the
 * SPA with a machine-readable ?sso_error=<code> the login/profile pages map
 * to friendly copy. Success converges on the exact same outcome as password
 * login: a signed `ritjira_token` cookie.
 */

// PKCE verifier + state round-trip between /sso/microsoft and its callback in
// a short-lived signed cookie (the OAuth dance spans two separate requests).
// Path-scoped so it never rides along on regular API calls.
const SSO_STASH_COOKIE = 'ritjira_sso';
const SSO_STASH_TTL_SEC = 600;
const SSO_COOKIE_OPTS = { ...config.cookie, path: '/api/auth/sso' };

/**
 * What the user actually asked for, declared by the button that started the
 * flow (NOT inferred from an ambient session):
 *  - 'login' → authenticate only. NEVER links to a session cookie, so a stale
 *    session on a shared machine can't silently bind someone else's account.
 *  - 'link'  → attach this provider to the signed-in user (profile "Connect").
 */
type SsoIntent = 'login' | 'link';

interface SsoStash {
  codeVerifier: string;
  state: string;
  /** Absent on legacy in-flight tokens → treated as the safe 'login' default. */
  intent?: SsoIntent;
}

/** The user id from the session cookie, if any. Only used to LINK on an
 *  explicit link intent — a plain login ignores it (see callbackMicrosoft). */
function sessionUserId(req: Request): string | undefined {
  const token = req.cookies?.[config.jwt.cookieName];
  if (!token) return undefined;
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { sub: string };
    return decoded.sub;
  } catch {
    return undefined;
  }
}

export const ssoController = {
  /** Public: which providers the login page should offer buttons for. */
  async providers(_req: Request, res: Response) {
    res.json({ providers: ssoService.listProviders() });
  },

  /** Kick off the Microsoft redirect dance. */
  async startMicrosoft(req: Request, res: Response) {
    if (!isMicrosoftConfigured()) {
      return res.redirect(`${config.clientUrl}/login?sso_error=sso_failed`);
    }
    // Intent is declared by the caller (login page vs profile "Connect"), then
    // baked into the SIGNED stash so it survives the redirect tamper-proof. Any
    // value other than an explicit 'link' falls back to the safe 'login'.
    const intent: SsoIntent = req.query.intent === 'link' ? 'link' : 'login';
    try {
      const { redirectTo, stash } = await ssoService.startMicrosoft();
      const stashToken = jwt.sign({ ...stash, intent }, config.jwt.secret, {
        expiresIn: SSO_STASH_TTL_SEC,
      });
      res.cookie(SSO_STASH_COOKIE, stashToken, {
        ...SSO_COOKIE_OPTS,
        maxAge: SSO_STASH_TTL_SEC * 1000,
      });
      res.redirect(redirectTo);
    } catch (err) {
      logger.error('sso: failed to start microsoft flow', err);
      const target = sessionUserId(req) ? '/profile' : '/login';
      res.redirect(`${config.clientUrl}${target}?sso_error=sso_failed`);
    }
  },

  /** Microsoft redirects back here with ?code & ?state. */
  async callbackMicrosoft(req: Request, res: Response) {
    const sessionUser = sessionUserId(req);
    // Link attempts report back to the profile page; sign-ins to the login page.
    const errTarget = sessionUser ? '/profile' : '/login';
    try {
      const stashToken = req.cookies?.[SSO_STASH_COOKIE];
      res.clearCookie(SSO_STASH_COOKIE, SSO_COOKIE_OPTS);
      if (!stashToken) throw new SsoError('sso_failed', 'Missing SSO state cookie');
      const stash = jwt.verify(stashToken, config.jwt.secret) as unknown as SsoStash;
      const intent: SsoIntent = stash.intent === 'link' ? 'link' : 'login';

      // Rebuild the callback URL against the registered redirect URI's origin
      // rather than Host headers — openid-client only needs the query params.
      const currentUrl = new URL(
        req.originalUrl,
        new URL(config.sso.microsoft.redirectUri).origin,
      );

      const claims = await ssoService.completeMicrosoft(currentUrl, stash);

      // SECURITY: only a deliberate LINK flow may attach this Microsoft identity
      // to a signed-in account. A 'login' flow authenticates ONLY — it must
      // never link to whatever session cookie happens to be present, otherwise
      // a stale session on a shared machine silently binds (and hands every
      // future Microsoft login of) that account to the person at the keyboard.
      const linkUserId = intent === 'link' ? sessionUser : undefined;
      const { userId, outcome } = await ssoService.resolveUser('microsoft', claims, linkUserId);

      const user = await userModel.findById(userId);
      if (!user || user.disabledAt) throw new SsoError('disabled');

      // Same cookie a password login issues — downstream auth is identical.
      res.cookie(config.jwt.cookieName, userService.signToken(user), {
        ...config.cookie,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });
      res.redirect(
        outcome === 'linked'
          ? `${config.clientUrl}/profile?sso=linked`
          : `${config.clientUrl}/`,
      );
    } catch (err) {
      const code = err instanceof SsoError ? err.code : 'sso_failed';
      if (code === 'sso_failed') logger.error('sso: microsoft callback failed', err);
      else logger.warn(`sso: microsoft sign-in rejected (${code})`);
      res.redirect(`${config.clientUrl}${errTarget}?sso_error=${code}`);
    }
  },

  /** Authenticated: the caller's linked identities (profile page). */
  async identities(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    res.json({ identities: await ssoService.listIdentities(req.user.id) });
  },

  /** Authenticated: unlink a provider (password-confirmed, see ssoService). */
  async disconnect(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const { currentPassword } = req.body as { currentPassword: string };
    const result = await ssoService.disconnect(req.user.id, req.params.provider, currentPassword);
    res.json(result);
  },
};
