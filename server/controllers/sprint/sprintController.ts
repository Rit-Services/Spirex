// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { sprintService } from '../../services/sprint/sprintService.js';
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

export const sprintController = {
  async list(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertProjectAction(req, projectId, 'project:view');
    const sprints = await sprintService.list(projectId);
    res.json({ sprints });
  },

  async get(req: Request, res: Response) {
    const sprint = await sprintService.get(req.params.id);
    await assertProjectAction(req, sprint.projectId, 'project:view');
    res.json({ sprint });
  },

  async detail(req: Request, res: Response) {
    const sprint = await sprintService.get(req.params.id);
    await assertProjectAction(req, sprint.projectId, 'project:view');
    const data = await sprintService.getDetail(req.params.id);
    res.json(data);
  },

  async create(req: Request, res: Response) {
    const projectId = String(req.body.projectId || '');
    await assertProjectAction(req, projectId, 'sprint:create');
    if (!req.user) throw ErrorResponse.unauthorized();
    const sprint = await sprintService.create({
      projectId,
      name: req.body.name,
      goal: req.body.goal ?? null,
      startDate: req.body.startDate ? new Date(req.body.startDate) : null,
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      createdById: req.user.id,
    });
    res.status(201).json({ sprint });
  },

  async update(req: Request, res: Response) {
    const existing = await sprintService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'sprint:edit');
    const sprint = await sprintService.update(req.params.id, {
      ...req.body,
      startDate: req.body.startDate !== undefined
        ? (req.body.startDate ? new Date(req.body.startDate) : null)
        : undefined,
      endDate: req.body.endDate !== undefined
        ? (req.body.endDate ? new Date(req.body.endDate) : null)
        : undefined,
    });
    res.json({ sprint });
  },

  async start(req: Request, res: Response) {
    const existing = await sprintService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'sprint:start');
    if (!req.user) throw ErrorResponse.unauthorized();
    const sprint = await sprintService.start(req.params.id, req.user.id);
    res.json({ sprint });
  },

  async complete(req: Request, res: Response) {
    const existing = await sprintService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'sprint:complete');
    if (!req.user) throw ErrorResponse.unauthorized();
    const { sprint, createdSprint } = await sprintService.complete(
      req.params.id,
      { incompleteTarget: req.body?.incompleteTarget },
      req.user.id,
    );
    res.json({ sprint, createdSprint });
  },

  async remove(req: Request, res: Response) {
    const existing = await sprintService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'sprint:delete');
    await sprintService.remove(req.params.id);
    res.status(204).end();
  },

  async burndown(req: Request, res: Response) {
    const existing = await sprintService.get(req.params.id);
    await assertProjectAction(req, existing.projectId, 'project:view');
    const data = await sprintService.burndown(req.params.id);
    res.json(data);
  },
};
