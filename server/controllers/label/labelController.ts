// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { labelService } from '../../services/label/labelService.js';
import { projectService } from '../../services/project/projectService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can, type Action, type ProjectRole } from '../../utils/permissions.js';
import { prisma } from '../../db/prisma.js';

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

export const labelController = {
  async listForProject(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'project:view');
    const labels = await labelService.list(projectId);
    res.json({ labels });
  },

  // Creating + managing labels is gated on story:edit — "anyone who can edit a
  // ticket can add a label" (labels are created on-the-fly from the picker).
  async create(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'story:edit');
    const label = await labelService.create(projectId, {
      name: req.body.name,
      color: req.body.color,
    });
    res.status(201).json({ label });
  },

  async update(req: Request, res: Response) {
    const existing = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ErrorResponse.notFound('Label not found');
    await assertProjectAction(req, existing.projectId, 'story:edit');
    const label = await labelService.update(req.params.id, {
      name: req.body.name,
      color: req.body.color,
    });
    res.json({ label });
  },

  async remove(req: Request, res: Response) {
    const existing = await prisma.label.findUnique({ where: { id: req.params.id } });
    if (!existing) throw ErrorResponse.notFound('Label not found');
    await assertProjectAction(req, existing.projectId, 'story:edit');
    await labelService.remove(req.params.id);
    res.status(204).end();
  },
};
