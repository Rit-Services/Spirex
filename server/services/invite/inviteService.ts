// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { userModel } from '../../models/user/user.js';
import { inviteModel } from '../../models/invite/invite.js';
import { notificationModel } from '../../models/notification/notification.js';
import { orgMemberService, assertSeatAvailable } from '../org/orgMemberService.js';
import { mailer } from '../mailer/mailer.js';
import { config, isMailerConfigured } from '../../config/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import logger from '../../utils/logger.js';
import type { GlobalRole } from '@prisma/client';

const BCRYPT_ROUNDS = 10;

// What the accept page must collect:
//  - 'set_password' → a brand-new account (or a legacy password-reset invite):
//    show the set-password form.
//  - 'join_org'     → an existing account being invited into another org: no
//    password, just a one-click "join" consent.
export type InviteMode = 'set_password' | 'join_org';

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export const inviteService = {
  /**
   * Create a fresh invite for a user. Returns the raw token (only shown once)
   * AND the absolute invite URL the email links to. Caller decides whether
   * to email it, return it to the admin, or both.
   *
   * Phase 2: optionally records the target org + role so accept can create the
   * membership (and check the seat) at accept time.
   */
  async issueInvite(
    userId: string,
    opts?: { organizationId?: string; role?: GlobalRole },
  ): Promise<{ token: string; expiresAt: Date; inviteUrl: string }> {
    await inviteModel.invalidateForUser(userId);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + config.invites.ttlHours * 60 * 60 * 1000);
    await inviteModel.create({
      userId,
      tokenHash,
      expiresAt,
      organizationId: opts?.organizationId ?? null,
      role: opts?.role ?? null,
    });
    const inviteUrl = `${config.clientUrl.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(token)}`;
    return { token, expiresAt, inviteUrl };
  },

  /**
   * Email-first invite into an org. Branches on whether an account already
   * exists for the email:
   *  - no account  → create a shell user (no membership yet) + a 'set_password'
   *    invite; the membership is created when they accept.
   *  - account     → a cross-org 'join_org' invite (no new user, no password) —
   *    accepting adds the membership with their consent.
   * The seat is pre-checked here for fast admin feedback AND re-checked atomically
   * at accept (the authoritative gate).
   */
  async inviteToOrg(
    organizationId: string,
    input: { email: string; name?: string; role: GlobalRole },
  ): Promise<{
    inviteUrl: string;
    expiresAt: Date;
    mode: InviteMode;
    recipient: { name: string; email: string };
  }> {
    const email = input.email.trim();
    // Fail fast if the org is already full — don't create a shell user we can't seat.
    await assertSeatAvailable(prisma, organizationId);
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'the organization';

    const existing = await userModel.findByEmail(email);
    let userId: string;
    let recipientName: string;
    let mode: InviteMode;

    if (existing) {
      const membership = await orgMemberService.getMembership(organizationId, existing.id);
      if (membership) {
        throw ErrorResponse.conflict('This person is already a member of this organization');
      }
      userId = existing.id;
      recipientName = existing.name;
      mode = 'join_org';
    } else {
      if (!input.name?.trim()) {
        throw ErrorResponse.badRequest('A name is required to invite a new person');
      }
      // Unguessable placeholder — the invitee sets a real password on accept.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), BCRYPT_ROUNDS);
      const user = await prisma.user.create({
        data: {
          name: input.name.trim(),
          email,
          passwordHash,
          // M4: no globalRole write — role lives on the OrgMembership created at accept.
          avatarUrl: null,
        },
      });
      userId = user.id;
      recipientName = user.name;
      mode = 'set_password';
    }

    const { inviteUrl, expiresAt } = await this.issueInvite(userId, { organizationId, role: input.role });

    // Existing accounts also get an in-app notification (the bell) — they're
    // already logged into RitJira somewhere, so an email alone is easy to miss.
    // Brand-new accounts have no in-app session yet, so email is their only channel.
    if (mode === 'join_org') {
      await notificationModel
        .create({
          userId,
          organizationId,
          type: 'org_invite',
          title: `Invitation to join ${orgName}`,
          body: `You've been invited to join ${orgName} as ${input.role}.`,
        })
        .catch((err) => logger.error('invite: in-app notification write failed', err));
    }

    return { inviteUrl, expiresAt, mode, recipient: { name: recipientName, email } };
  },

  /**
   * Admin-side view: an org's live, pending invitations (sent but not yet
   * accepted). Lets an admin see exactly who's still outstanding — the member
   * roster only ever shows people who already accepted.
   */
  async listPendingForOrg(organizationId: string) {
    const invites = await inviteModel.listPendingForOrg(organizationId);
    return invites.map((inv) => ({
      id: inv.id,
      name: inv.user.name,
      email: inv.user.email,
      role: (inv.role ?? 'member') as GlobalRole,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    }));
  },

  /**
   * Re-send a pending org invite: mint a FRESH token + expiry (which invalidates
   * the previous one) and email it again. Org-scoped — the invite must belong to
   * this org and still be unconsumed. Returns the new expiry + email status so
   * the admin gets the same feedback as the original send.
   */
  async resendForOrg(organizationId: string, inviteId: string) {
    const invite = await inviteModel.findById(inviteId);
    if (!invite || invite.organizationId !== organizationId) {
      throw ErrorResponse.notFound('Invite not found');
    }
    if (invite.consumedAt) {
      throw ErrorResponse.badRequest('This invite has already been accepted');
    }
    const { inviteUrl, expiresAt } = await this.issueInvite(invite.userId, {
      organizationId,
      role: invite.role ?? undefined,
    });
    const emailResult = await this.sendInviteEmail({
      to: invite.user.email,
      name: invite.user.name,
      inviteUrl,
      expiresAt,
    });
    return {
      recipient: { name: invite.user.name, email: invite.user.email },
      expiresAt,
      emailSent: emailResult.sent,
      emailReason: emailResult.sent ? undefined : emailResult.reason,
    };
  },

  async sendInviteEmail(opts: { to: string; name: string; inviteUrl: string; expiresAt: Date }) {
    if (!isMailerConfigured()) {
      logger.warn(`inviteService: SMTP not configured — invite for ${opts.to} created but not emailed`);
      return { sent: false, reason: 'smtp_not_configured' as const };
    }
    return mailer.sendInvite(opts);
  },

  async sendPasswordResetEmail(opts: { to: string; name: string; resetUrl: string; expiresAt: Date }) {
    if (!isMailerConfigured()) {
      logger.warn(`inviteService: SMTP not configured — reset link for ${opts.to} created but not emailed`);
      return { sent: false, reason: 'smtp_not_configured' as const };
    }
    return mailer.sendPasswordReset(opts);
  },

  /** Look up an invite by raw token. Throws on missing/expired/consumed. */
  async loadByToken(rawToken: string) {
    if (!rawToken) throw ErrorResponse.badRequest('Missing invite token');
    const invite = await inviteModel.findByTokenHash(hashToken(rawToken));
    if (!invite) throw ErrorResponse.notFound('Invite not found');
    if (invite.consumedAt) throw ErrorResponse.badRequest('This invite has already been used');
    if (invite.expiresAt.getTime() < Date.now()) throw ErrorResponse.badRequest('This invite has expired');
    if (invite.user.disabledAt) throw ErrorResponse.badRequest('This account is disabled');
    return invite;
  },

  /**
   * Decide which accept UI to show. A cross-org invite for someone who already
   * has at least one membership only needs consent; everyone else (brand-new
   * account, or a legacy password-reset invite with no org) sets a password.
   */
  async resolveMode(invite: { userId: string; organizationId: string | null }): Promise<InviteMode> {
    if (!invite.organizationId) return 'set_password';
    const priorMemberships = await prisma.orgMembership.count({ where: { userId: invite.userId } });
    return priorMemberships === 0 ? 'set_password' : 'join_org';
  },

  /**
   * Consume an invite. In ONE transaction:
   *  - 'set_password' invites set the user's password (required);
   *  - when the invite targets an org and the user isn't a member yet, create
   *    the membership — seat-checked here, atomically (the authoritative gate);
   *  - mark the invite used.
   * M4: role is set on OrgMembership only — no User.globalRole mirror, so a
   * cross-org join never touches the user's role in any other org.
   */
  async accept(rawToken: string, newPassword?: string) {
    const invite = await this.loadByToken(rawToken);
    const mode = await this.resolveMode(invite);
    return this.consume(invite, mode, newPassword);
  },

  /** Shared consume core for both the public (token) and authenticated (id)
   *  accept paths. Sets the password for new accounts, creates the org
   *  membership (seat-checked, atomic) when needed, and marks the invite used. */
  async consume(
    invite: { id: string; userId: string; organizationId: string | null; role: GlobalRole | null },
    mode: InviteMode,
    newPassword?: string,
  ) {
    if (mode === 'set_password' && (!newPassword || newPassword.length < 8)) {
      throw ErrorResponse.badRequest('A password of at least 8 characters is required');
    }

    return prisma.$transaction(async (tx) => {
      if (mode === 'set_password' && newPassword) {
        const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await tx.user.update({ where: { id: invite.userId }, data: { passwordHash } });
      }

      if (invite.organizationId) {
        const already = await tx.orgMembership.findUnique({
          where: {
            organizationId_userId: { organizationId: invite.organizationId, userId: invite.userId },
          },
        });
        if (!already) {
          await assertSeatAvailable(tx, invite.organizationId);
          // M4: OrgMembership.role is the sole authority — no globalRole mirror.
          await tx.orgMembership.create({
            data: {
              organizationId: invite.organizationId,
              userId: invite.userId,
              role: invite.role ?? 'member',
            },
          });
        }
      }

      await tx.invite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: invite.userId } });
      return { user, organizationId: invite.organizationId };
    });
  },

  // ── Authenticated in-app flow (bell → /invitations) ─────────────────────────

  /** The signed-in user's live, pending org invitations. */
  async listPendingForUser(userId: string) {
    const invites = await inviteModel.listPendingForUser(userId, new Date());
    return invites.map((inv) => ({
      id: inv.id,
      role: (inv.role ?? 'member') as GlobalRole,
      expiresAt: inv.expiresAt.toISOString(),
      organization: inv.organization
        ? { id: inv.organization.id, name: inv.organization.name, slug: inv.organization.slug }
        : null,
    }));
  },

  /** Load an invite by id and assert it belongs to this user (in-app actions
   *  are authenticated, so no token is needed). */
  async loadOwnedById(inviteId: string, userId: string) {
    const invite = await inviteModel.findById(inviteId);
    if (!invite || invite.userId !== userId) throw ErrorResponse.notFound('Invite not found');
    if (invite.consumedAt) throw ErrorResponse.badRequest('This invite has already been used');
    if (invite.expiresAt.getTime() < Date.now()) throw ErrorResponse.badRequest('This invite has expired');
    return invite;
  },

  /** Accept one's own pending invite from inside the app (no password — the
   *  account already exists). */
  async acceptOwn(inviteId: string, userId: string) {
    const invite = await this.loadOwnedById(inviteId, userId);
    const mode = await this.resolveMode(invite);
    return this.consume(invite, mode);
  },

  /** Decline one's own invite — consume it without creating a membership. */
  async declineOwn(inviteId: string, userId: string) {
    const invite = await this.loadOwnedById(inviteId, userId);
    await inviteModel.consume(invite.id);
  },
};
