// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { organizationService } from '../../services/org/organizationService.js';
import { orgMemberService } from '../../services/org/orgMemberService.js';
import { userService } from '../../services/user/userService.js';
import { inviteService } from '../../services/invite/inviteService.js';
import { userModel } from '../../models/user/user.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

const LOGO_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

// All routes here sit behind authHandler + requireSuperAdmin (see
// routes/superadminRoutes.ts), so every handler already knows the caller is the
// platform operator — no per-handler permission checks needed.
export const organizationController = {
  async list(_req: Request, res: Response) {
    const organizations = await organizationService.list();
    res.json({ organizations });
  },

  // Command-bar search across the platform: organizations + members (any org).
  // Short queries return empty rather than scanning every row.
  async search(req: Request, res: Response) {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      return res.json({ organizations: [], members: [] });
    }
    const [organizations, members] = await Promise.all([
      organizationService.search(q, 6),
      orgMemberService.search(q, 8),
    ]);
    res.json({ organizations, members });
  },

  async get(req: Request, res: Response) {
    const organization = await organizationService.getById(req.params.id);
    res.json({ organization });
  },

  async create(req: Request, res: Response) {
    const organization = await organizationService.create(req.body);
    res.status(201).json({ organization });
  },

  async update(req: Request, res: Response) {
    const organization = await organizationService.update(req.params.id, req.body);
    res.json({ organization });
  },

  async suspend(req: Request, res: Response) {
    const organization = await organizationService.setStatus(req.params.id, 'suspended');
    res.json({ organization });
  },

  async reactivate(req: Request, res: Response) {
    const organization = await organizationService.setStatus(req.params.id, 'active');
    res.json({ organization });
  },

  // ── Members (provisioning) ────────────────────────────────────────────────
  // The superadmin seeds each org's first admin here, then can manage anyone in
  // any org. Seat enforcement + write-through live in orgMemberService.

  async listMembers(req: Request, res: Response) {
    // Surface the org's seat cap alongside the roster so the UI can show used/max.
    const organization = await organizationService.getById(req.params.id);
    const members = await orgMemberService.listForOrg(req.params.id);
    res.json({ members, maxUsers: organization.maxUsers, seatsUsed: members.length });
  },

  async addMember(req: Request, res: Response) {
    const orgId = req.params.id;
    const body = req.body as {
      name: string;
      email: string;
      password?: string;
      mode?: 'password' | 'invite';
      role?: 'admin' | 'member' | 'external';
    };
    const mode = body.mode ?? 'password';
    const user = await orgMemberService.createMember(orgId, {
      name: body.name,
      email: body.email,
      role: body.role ?? 'admin', // bootstrap default: the org's first admin
      mode,
      password: body.password,
    });

    if (mode === 'invite') {
      const { inviteUrl, expiresAt } = await inviteService.issueInvite(user.id);
      const result = await inviteService.sendInviteEmail({
        to: user.email,
        name: user.name,
        inviteUrl,
        expiresAt,
      });
      return res.status(201).json({
        user: userService.publicProfile(user),
        invite: {
          url: inviteUrl,
          expiresAt: expiresAt.toISOString(),
          emailSent: result.sent,
          emailReason: result.sent ? undefined : result.reason,
        },
      });
    }

    res.status(201).json({ user: userService.publicProfile(user) });
  },

  // Superadmin: check whether an email already has a SPIREX account and whether
  // they're already in THIS org. Powers the dialog's "create new vs invite
  // existing" branching — same shape as the tenant-admin lookup.
  async lookupMember(req: Request, res: Response) {
    const orgId = req.params.id;
    const email = String(req.query.email ?? '').trim();
    const user = await userModel.findByEmail(email);
    if (!user) return res.json({ exists: false, alreadyMember: false });
    const membership = await orgMemberService.getMembership(orgId, user.id);
    res.json({ exists: true, alreadyMember: !!membership, name: user.name });
  },

  // Superadmin: invite someone to THIS org by email. inviteToOrg branches on
  // whether an account exists — a new email gets a set-password invite, an
  // existing one gets a cross-org "join" invite (in-app + email). The membership
  // and seat are committed when they accept, not now.
  async inviteMember(req: Request, res: Response) {
    const orgId = req.params.id;
    const body = req.body as {
      email: string;
      name?: string;
      role?: 'admin' | 'member' | 'external';
    };
    const result = await inviteService.inviteToOrg(orgId, {
      email: body.email,
      name: body.name,
      role: body.role ?? 'member',
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

  async setMemberRole(req: Request, res: Response) {
    const { role } = req.body as { role: 'admin' | 'member' | 'external' };
    const user = await orgMemberService.setRole(req.params.id, req.params.userId, role);
    res.json({ user: userService.publicProfile(user) });
  },

  async removeMember(req: Request, res: Response) {
    await orgMemberService.removeMember(req.params.id, req.params.userId);
    res.status(204).end();
  },

  // Superadmin sets any org's logo (same store + validation as the tenant path).
  async uploadLogo(req: Request, res: Response) {
    if (!req.file) throw ErrorResponse.badRequest('No file provided');
    const ext = LOGO_EXT_BY_MIME[req.file.mimetype];
    if (!ext) throw ErrorResponse.badRequest('Logo must be a PNG, JPEG, WebP, or GIF image');
    if (req.file.size > MAX_LOGO_BYTES) throw ErrorResponse.badRequest('Logo too large (max 2 MB)');
    const organization = await organizationService.setLogo(req.params.id, {
      buffer: req.file.buffer,
      ext,
    });
    res.json({ organization });
  },
};
