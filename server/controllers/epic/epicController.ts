// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { epicService } from '../../services/epic/epicService.js';
import { projectService } from '../../services/project/projectService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can, type Action, type ProjectRole } from '../../utils/permissions.js';

async function assertProjectAction(req: Request, projectId: string, action: Action) {
  if (!req.user) throw ErrorResponse.unauthorized();
  const membership = await projectService.getMembership(projectId, req.user.id);
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
}

export const epicController = {
  async list(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertProjectAction(req, projectId, 'project:view');
    const epics = await epicService.list(projectId);
    res.json({ epics });
  },

  async get(req: Request, res: Response) {
    const epic = await epicService.get(req.params.id);
    await assertProjectAction(req, epic.projectId, 'project:view');
    res.json({ epic });
  },

  async create(req: Request, res: Response) {
    const projectId = String(req.body.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertProjectAction(req, projectId, 'epic:create');
    if (!req.user) throw ErrorResponse.unauthorized();

    const epic = await epicService.create({
      projectId,
      title: req.body.title,
      description: req.body.description ?? null,
      color: req.body.color,
      status: req.body.status,
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      targetDate: req.body.targetDate ? new Date(req.body.targetDate) : null,
      createdById: req.user.id,
    });
    res.status(201).json({ epic });
  },

  async update(req: Request, res: Response) {
    const existing = await epicService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'epic:edit');
    const epic = await epicService.update(req.params.id, {
      ...req.body,
      startDate: req.body.startDate !== undefined
        ? (req.body.startDate ? new Date(req.body.startDate) : null)
        : undefined,
      targetDate: req.body.targetDate !== undefined
        ? (req.body.targetDate ? new Date(req.body.targetDate) : null)
        : undefined,
    });
    res.json({ epic });
  },

  async remove(req: Request, res: Response) {
    const existing = await epicService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'epic:delete');
    await epicService.remove(req.params.id);
    res.status(204).end();
  },
};
