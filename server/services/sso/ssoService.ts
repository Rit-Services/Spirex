// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import * as oidc from 'openid-client';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db/prisma.js';
import { config } from '../../config/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import logger from '../../utils/logger.js';

/**
 * SSO sign-in (Phase 1: Microsoft Entra ID, OIDC authorization-code + PKCE).
 *
 * Design rules (see AuthIdentity in schema.prisma):
 *  - SSO never creates users. SPIREX is invite-only; an SSO callback that
 *    matches no existing account ends in `not_invited`, full stop.
 *  - Identity lookup is by the immutable provider subject (Entra `oid`),
 *    never by email. Email is only consulted ONCE — at first sign-in, to
 *    auto-link an existing account — and only when the token carries a
 *    verified-email signal (single-tenant match / xms_edov / email_verified).
 *    Entra's email claim is otherwise spoofable from a rogue tenant.
 *  - Linking to a signed-in account happens ONLY on an explicit link intent
 *    (the profile "Connect" button; see ssoController). The controller passes a
 *    sessionUserId to resolveUser only in that case — a plain login never links
 *    to an ambient session, so a stale cookie can't bind someone else's account.
 *    On a genuine link the session itself is the proof, so no email trust is
 *    needed.
 */

/** Machine-readable failure codes surfaced to the SPA as ?sso_error=<code>. */
export type SsoErrorCode =
  | 'not_invited'
  | 'email_unverified'
  | 'disabled'
  | 'already_linked'
  | 'sso_failed';

export class SsoError extends Error {
  constructor(public readonly code: SsoErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface SsoClaims {
  providerUserId: string;
  email: string | null;
  /** True when the token's email can be trusted for first-time auto-linking. */
  emailTrusted: boolean;
}

const ms = config.sso.microsoft;

// Tenant placeholders accept tokens from ANY directory — only a concrete
// directory ID makes the issuer itself a trust signal for email matching.
const MS_MULTI_TENANT = new Set(['common', 'organizations', 'consumers']);

export const isMicrosoftConfigured = (): boolean =>
  Boolean(ms.clientId && ms.clientSecret);

// OIDC discovery hits the network, so resolve once and cache. Cleared on
// failure so a transient outage doesn't poison every later sign-in.
let msDiscovery: Promise<oidc.Configuration> | null = null;

function getMicrosoftConfig(): Promise<oidc.Configuration> {
  if (!msDiscovery) {
    msDiscovery = oidc
      .discovery(
        new URL(`https://login.microsoftonline.com/${ms.tenant}/v2.0`),
        ms.clientId,
        ms.clientSecret,
      )
      .catch((err) => {
        msDiscovery = null;
        throw err;
      });
  }
  return msDiscovery;
}

export const ssoService = {
  listProviders(): string[] {
    return isMicrosoftConfigured() ? ['microsoft'] : [];
  },

  /**
   * Build the Microsoft authorization redirect. The returned `stash` (PKCE
   * verifier + state) must round-trip via a short-lived signed cookie so the
   * callback can validate the response.
   */
  async startMicrosoft(): Promise<{
    redirectTo: string;
    stash: { codeVerifier: string; state: string };
  }> {
    const oidcConfig = await getMicrosoftConfig();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
    const state = oidc.randomState();
    const redirectTo = oidc.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: ms.redirectUri,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return { redirectTo: redirectTo.href, stash: { codeVerifier, state } };
  },

  /**
   * Exchange the callback's code for tokens and distill the claims we act on.
   * openid-client validates signature, issuer (incl. Entra's {tenantid}
   * placeholder on multi-tenant), audience, expiry, state and PKCE for us.
   */
  async completeMicrosoft(
    currentUrl: URL,
    stash: { codeVerifier: string; state: string },
  ): Promise<SsoClaims> {
    const oidcConfig = await getMicrosoftConfig();
    const tokens = await oidc.authorizationCodeGrant(oidcConfig, currentUrl, {
      pkceCodeVerifier: stash.codeVerifier,
      expectedState: stash.state,
    });
    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims) throw new SsoError('sso_failed', 'No ID token in response');

    // `oid` is the directory object id — stable per account. `sub` is only
    // pairwise-stable per app; fine as a fallback but oid is preferred.
    const providerUserId = String(claims.oid ?? claims.sub ?? '');
    if (!providerUserId) throw new SsoError('sso_failed', 'Token has no subject');

    const rawEmail = [claims.email, claims.preferred_username].find(
      (v): v is string => typeof v === 'string' && v.includes('@'),
    );
    const email = rawEmail ? rawEmail.trim().toLowerCase() : null;

    // Email is trustworthy for auto-linking when ANY of:
    //  - we run single-tenant and the token came from that very tenant;
    //  - Entra attests domain-owner-verified email (xms_edov, needs the
    //    optional claim enabled on the app registration);
    //  - the token carries an explicit email_verified=true.
    const singleTenant = !MS_MULTI_TENANT.has(ms.tenant);
    const emailTrusted =
      (singleTenant && claims.tid === ms.tenant) ||
      claims.xms_edov === true ||
      claims.xms_edov === 'true' ||
      claims.email_verified === true;

    return { providerUserId, email, emailTrusted };
  },

  /**
   * Map validated SSO claims onto a local user.
   *
   * Resolution order:
   *  1. Existing AuthIdentity → that user signs in (or, mid-link, conflict).
   *  2. sessionUserId present → link the identity to that user; the session is
   *     the identity proof, email trust is irrelevant. The controller supplies
   *     this ONLY for an explicit link intent, never for a plain login, so an
   *     ambient session can't turn a sign-in into a silent cross-account link.
   *  3. Trusted email matching an existing account → auto-link + sign in.
   *  4. Anything else → typed SsoError; never a new user.
   */
  async resolveUser(
    provider: 'microsoft',
    claims: SsoClaims,
    sessionUserId?: string,
  ): Promise<{ userId: string; outcome: 'login' | 'linked' }> {
    const identity = await prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId: claims.providerUserId } },
      include: { user: { select: { id: true, disabledAt: true } } },
    });

    if (identity) {
      if (sessionUserId && identity.userId !== sessionUserId) {
        throw new SsoError('already_linked');
      }
      if (identity.user.disabledAt) throw new SsoError('disabled');
      return { userId: identity.userId, outcome: 'login' };
    }

    if (sessionUserId) {
      const user = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, disabledAt: true },
      });
      if (!user || user.disabledAt) throw new SsoError('disabled');
      await prisma.authIdentity.create({
        data: {
          userId: user.id,
          provider,
          providerUserId: claims.providerUserId,
          email: claims.email ?? '',
        },
      });
      logger.info(`sso: linked ${provider} identity to user ${user.id} (explicit)`);
      return { userId: user.id, outcome: 'linked' };
    }

    if (!claims.email || !claims.emailTrusted) {
      throw new SsoError('email_unverified');
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: claims.email, mode: 'insensitive' } },
      select: { id: true, disabledAt: true },
    });
    if (!user) throw new SsoError('not_invited');
    if (user.disabledAt) throw new SsoError('disabled');

    await prisma.authIdentity.create({
      data: {
        userId: user.id,
        provider,
        providerUserId: claims.providerUserId,
        email: claims.email,
      },
    });
    logger.info(`sso: linked ${provider} identity to user ${user.id} (email match)`);
    return { userId: user.id, outcome: 'login' };
  },

  /**
   * Unlink a provider. Requires the current password — proof the user keeps a
   * working sign-in method after the identity is gone (an SSO-native user
   * with a never-set password cannot disconnect their only way in, which is
   * exactly the point).
   */
  async disconnect(userId: string, provider: string, currentPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, disabledAt: true },
    });
    if (!user || user.disabledAt) throw ErrorResponse.unauthorized();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw ErrorResponse.badRequest('Current password is incorrect');

    const { count } = await prisma.authIdentity.deleteMany({
      where: { userId, provider },
    });
    if (count === 0) throw ErrorResponse.notFound('No linked account for that provider');
    logger.info(`sso: unlinked ${provider} identity from user ${userId}`);
    return { message: 'Account disconnected' };
  },

  /** The signed-in user's linked identities, for the profile page. */
  async listIdentities(userId: string) {
    const rows = await prisma.authIdentity.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { provider: true, email: true, createdAt: true },
    });
    return rows.map((r) => ({
      provider: r.provider,
      email: r.email,
      linkedAt: r.createdAt.toISOString(),
    }));
  },
};
