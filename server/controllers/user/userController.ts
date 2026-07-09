// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { userService } from '../../services/user/userService.js';
import { orgMemberService } from '../../services/org/orgMemberService.js';
import { inviteService } from '../../services/invite/inviteService.js';
import { userModel } from '../../models/user/user.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

// Phase 13: tenant user management is org-scoped. Every operation here resolves
// the caller's active org from req.orgContext and refuses to touch a user who
// isn't a member of it — so one org's admin can never see or modify another
// tenant's people. (The platform superadmin manages members from /superadmin.)
function requireOrgId(req: Request): string {
  const orgId = req.orgContext?.orgId;
  if (!orgId) throw ErrorResponse.forbidden('No active organization');
  return orgId;
}

async function assertMemberOfOrg(orgId: string, userId: string) {
  const membership = await orgMemberService.getMembership(orgId, userId);
  if (!membership) throw ErrorResponse.notFound('User not found');
}

export const userController = {
  async list(req: Request, res: Response) {
    const orgId = req.orgContext?.orgId;
    if (!orgId) return res.json({ users: [] });
    const users = await orgMemberService.listForOrg(orgId);
    res.json({ users });
  },

  /**
   * Slim directory of active users in the caller's org — used by the
   * project-settings member picker. Org-scoped so the picker only offers
   * teammates from the same tenant.
   */
  async directory(req: Request, res: Response) {
    const orgId = req.orgContext?.orgId;
    if (!orgId) return res.json({ users: [] });
    const members = await orgMemberService.listForOrg(orgId);
    res.json({
      users: members
        .filter((u) => u.disabledAt === null)
        .map((u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl })),
    });
  },

  async detail(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    await assertMemberOfOrg(orgId, req.params.id);
    const result = await userService.getDetail(req.params.id, orgId);
    if (!result) throw ErrorResponse.notFound('User not found');
    res.json(result);
  },

  async create(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    const body = req.body as {
      name: string;
      email: string;
      password?: string;
      mode?: 'password' | 'invite';
      globalRole?: 'admin' | 'member' | 'external';
    };
    const mode = body.mode ?? 'password';

    // Invite mode: the person hasn't joined yet, so we must NOT seat them as an
    // active member now — that would show them as "accepted" before they've done
    // anything. Defer the membership to accept time by reusing the org-scoped
    // invite path (single source of truth with POST /users/invite). Until they
    // accept they live in the pending-invites list, never the member roster.
    if (mode === 'invite') {
      const result = await inviteService.inviteToOrg(orgId, {
        email: body.email,
        name: body.name,
        role: body.globalRole ?? 'member',
      });
      const emailResult = await inviteService.sendInviteEmail({
        to: result.recipient.email,
        name: result.recipient.name,
        inviteUrl: result.inviteUrl,
        expiresAt: result.expiresAt,
      });
      const invitee = await userModel.findByEmail(body.email);
      return res.status(201).json({
        user: invitee ? userService.publicProfile(invitee) : null,
        invite: {
          url: result.inviteUrl,
          expiresAt: result.expiresAt.toISOString(),
          emailSent: emailResult.sent,
          emailReason: emailResult.sent ? undefined : emailResult.reason,
        },
      });
    }

    // Password mode: a genuinely active member with a known credential — seat
    // them in this org now (seat-checked + atomic).
    const user = await orgMemberService.createMember(orgId, {
      name: body.name,
      email: body.email,
      role: body.globalRole ?? 'member',
      mode: 'password',
      password: body.password,
    });
    res.status(201).json({ user: userService.publicProfile(user) });
  },

  /**
   * Admin: check whether an email already has a SPIREX account, and whether
   * they're already in this org. Powers the invite dialog's live "create new vs
   * invite existing" branching.
   */
  async lookup(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    const email = String(req.query.email ?? '').trim();
    const user = await userModel.findByEmail(email);
    if (!user) return res.json({ exists: false, alreadyMember: false });
    const membership = await orgMemberService.getMembership(orgId, user.id);
    res.json({ exists: true, alreadyMember: !!membership, name: user.name });
  },

  /**
   * Admin: invite someone to THIS org by email. Branches on whether an account
   * already exists — a new email gets a set-password invite, an existing one
   * gets a cross-org "join my org" invite. The membership is created (and the
   * seat consumed) when they accept, not now.
   */
  async invite(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    const body = req.body as {
      email: string;
      name?: string;
      globalRole?: 'admin' | 'member' | 'external';
    };
    const result = await inviteService.inviteToOrg(orgId, {
      email: body.email,
      name: body.name,
      role: body.globalRole ?? 'member',
    });
    const emailResult = await inviteService.sendInviteEmail({
      to: result.recipient.email,
      name: result.recipient.name,
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt,
    });
    res.status(201).json({
      recipient: result.recipient,
      invite: {
        mode: result.mode,
        url: result.inviteUrl,
        expiresAt: result.expiresAt.toISOString(),
        emailSent: emailResult.sent,
        emailReason: emailResult.sent ? undefined : emailResult.reason,
      },
    });
  },

  /**
   * Admin: list this org's pending invites (sent but not yet accepted), so the
   * admin can see who's still outstanding. The member roster only shows people
   * who already accepted, leaving the admin blind to in-flight invites.
   */
  async pendingInvites(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    const invites = await inviteService.listPendingForOrg(orgId);
    res.json({ invites });
  },

  /** Admin: re-send a pending invite email (fresh token + expiry). */
  async resendInvite(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    const result = await inviteService.resendForOrg(orgId, req.params.id);
    res.json({
      recipient: result.recipient,
      invite: {
        expiresAt: result.expiresAt.toISOString(),
        emailSent: result.emailSent,
        emailReason: result.emailReason,
      },
    });
  },

  /** Admin: update a user's display name. */
  async update(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    await assertMemberOfOrg(orgId, req.params.id);
    const { name } = req.body as { name: string };
    const user = await userService.updateName(req.params.id, name);
    res.json({ user: userService.publicProfile(user) });
  },

  async disable(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    if (req.user?.id === req.params.id) {
      throw ErrorResponse.badRequest('Cannot disable your own account');
    }
    await assertMemberOfOrg(orgId, req.params.id);
    const user = await userService.disableUser(req.params.id);
    res.json({ user: userService.publicProfile(user) });
  },

  async enable(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    await assertMemberOfOrg(orgId, req.params.id);
    const user = await userService.enableUser(req.params.id);
    res.json({ user: userService.publicProfile(user) });
  },

  async updateGlobalRole(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    const { globalRole } = req.body as { globalRole: 'admin' | 'member' | 'external' };
    // `globalRole` here is just the request field name carrying the role to set;
    // it writes OrgMembership.role (the sole authority). Throws notFound if the
    // target isn't a member of this org.
    const user = await orgMemberService.setRole(orgId, req.params.id, globalRole);
    res.json({ user: userService.publicProfile(user) });
  },

  async resetPassword(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    await assertMemberOfOrg(orgId, req.params.id);
    const found = await userService.getDetail(req.params.id);
    if (!found) throw ErrorResponse.notFound('User not found');
    const method = (req.body?.method as 'temp' | 'email' | undefined) ?? 'temp';

    if (method === 'email') {
      const { inviteUrl, expiresAt } = await inviteService.issueInvite(req.params.id);
      const result = await inviteService.sendPasswordResetEmail({
        to: found.user.email,
        name: found.user.name,
        resetUrl: inviteUrl,
        expiresAt,
      });
      return res.json({
        method: 'email',
        reset: {
          url: inviteUrl,
          expiresAt: expiresAt.toISOString(),
          emailSent: result.sent,
          emailReason: result.sent ? undefined : result.reason,
        },
      });
    }

    const { tempPassword } = await userService.resetPassword(req.params.id);
    res.json({ method: 'temp', tempPassword });
  },
};
