// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import {
  projectService,
  projectMemberService,
  unlinkedUserService,
} from '../../services/project/projectService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can, PROJECT_ROLE_LEVEL, type ProjectRole } from '../../utils/permissions.js';

async function ensureProjectAccess(
  req: Request,
  action: 'project:view' | 'project:edit' | 'project:delete' | 'member:manage',
) {
  if (!req.user) throw ErrorResponse.unauthorized();
  const project = await projectService.getById(req.params.id);
  const membership = await projectService.getMembership(project.id, req.user.id);
  const allowed = can(
    {
      userId: req.user.id,
      isSuperAdmin: req.user.isSuperAdmin,
      orgRole: req.orgContext?.role,
      projectRole: membership?.projectRole as ProjectRole | undefined,
    },
    action,
  );
  if (!allowed) throw ErrorResponse.forbidden();
  return { project, membership };
}

export const projectController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    // Phase 2: every listing is scoped to the ACTIVE org. An org admin sees every
    // project in it; everyone else sees the ones they're a member of — but ONLY
    // within this org, so a multi-org user never sees another org's projects.
    const orgId = req.orgContext?.orgId;
    if (!orgId) return res.json({ projects: [] });
    const isAdmin = req.orgContext?.role === 'admin';
    const projects = isAdmin
      ? await projectService.listForOrg(orgId)
      : await projectService.listForUser(req.user.id, orgId);
    res.json({ projects });
  },

  async create(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    // Phase 13: a new project belongs to the creator's active organization.
    // Every tenant user resolves to exactly one org today; superadmins (no org)
    // don't create tenant projects through this path.
    const organizationId = req.orgContext?.orgId;
    if (!organizationId) {
      throw ErrorResponse.badRequest('No active organization to create the project in');
    }
    const project = await projectService.create({
      ...req.body,
      createdById: req.user.id,
      organizationId,
    });
    res.status(201).json({ project });
  },

  async get(req: Request, res: Response) {
    const { project } = await ensureProjectAccess(req, 'project:view');
    res.json({ project });
  },

  async update(req: Request, res: Response) {
    await ensureProjectAccess(req, 'project:edit');
    const project = await projectService.update(req.params.id, req.body);
    res.json({ project });
  },

  async remove(req: Request, res: Response) {
    await ensureProjectAccess(req, 'project:delete');
    await projectService.delete(req.params.id);
    res.status(204).end();
  },
};

function actorMaxAssignableLevel(
  orgRole: string | undefined,
  actorProjectRole: ProjectRole | undefined,
): number {
  // Org admins can assign any project role.
  if (orgRole === 'admin') return PROJECT_ROLE_LEVEL.lead;
  return actorProjectRole ? PROJECT_ROLE_LEVEL[actorProjectRole] : 0;
}

export const projectMemberController = {
  async list(req: Request, res: Response) {
    await ensureProjectAccess(req, 'project:view');
    const members = await projectMemberService.list(req.params.id);
    res.json({ members });
  },

  async upsert(req: Request, res: Response) {
    const { membership } = await ensureProjectAccess(req, 'member:manage');
    const { userId, projectRole } = req.body as { userId: string; projectRole: ProjectRole };

    const cap = actorMaxAssignableLevel(
      req.orgContext?.role,
      membership?.projectRole as ProjectRole | undefined,
    );
    if (PROJECT_ROLE_LEVEL[projectRole] > cap) {
      throw ErrorResponse.forbidden(
        `You can only assign roles at or below your own project access level`,
      );
    }

    // Block escalation: if updating an existing member, the actor cannot modify
    // someone whose current role outranks them.
    const existing = await projectService.getMembership(req.params.id, userId);
    if (existing && PROJECT_ROLE_LEVEL[existing.projectRole as ProjectRole] > cap) {
      throw ErrorResponse.forbidden(
        `You cannot change the role of a member who outranks you`,
      );
    }

    const member = await projectMemberService.upsert(req.params.id, userId, projectRole);
    res.json({ member });
  },

  async remove(req: Request, res: Response) {
    const { membership } = await ensureProjectAccess(req, 'member:manage');
    const cap = actorMaxAssignableLevel(
      req.orgContext?.role,
      membership?.projectRole as ProjectRole | undefined,
    );
    const target = await projectService.getMembership(req.params.id, req.params.userId);
    if (target && PROJECT_ROLE_LEVEL[target.projectRole as ProjectRole] > cap) {
      throw ErrorResponse.forbidden(
        `You cannot remove a member who outranks you`,
      );
    }
    await projectMemberService.remove(req.params.id, req.params.userId);
    res.status(204).end();
  },
};

export const unlinkedUserController = {
  // Listing/linking attribution is people-management, so it rides the same
  // member:manage gate as adding/removing members (leads + org admins).
  async list(req: Request, res: Response) {
    await ensureProjectAccess(req, 'member:manage');
    const users = await unlinkedUserService.listForProject(req.params.id);
    res.json({ users });
  },

  async link(req: Request, res: Response) {
    await ensureProjectAccess(req, 'member:manage');
    const { targetUserId } = req.body as { targetUserId: string };
    const result = await unlinkedUserService.link(req.params.id, req.params.ghostId, targetUserId);
    res.json(result);
  },
};
