// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { customFieldService } from '../../services/customField/customFieldService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction } from '../../utils/projectAccess.js';
import { prisma } from '../../db/prisma.js';

export const customFieldController = {
  async listForProject(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'project:view');
    const fields = await customFieldService.list(projectId);
    res.json({ fields });
  },

  async create(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'customfield:manage');
    const field = await customFieldService.create({
      projectId,
      name: req.body.name,
      type: req.body.type,
      options: req.body.options,
      isRequired: req.body.isRequired,
    });
    res.status(201).json({ field });
  },

  async update(req: Request, res: Response) {
    const def = await prisma.customFieldDefinition.findUnique({ where: { id: req.params.id } });
    if (!def) throw ErrorResponse.notFound('Custom field not found');
    await assertProjectAction(req, def.projectId, 'customfield:manage');
    const field = await customFieldService.update(req.params.id, req.body);
    res.json({ field });
  },

  async remove(req: Request, res: Response) {
    const def = await prisma.customFieldDefinition.findUnique({ where: { id: req.params.id } });
    if (!def) throw ErrorResponse.notFound('Custom field not found');
    await assertProjectAction(req, def.projectId, 'customfield:manage');
    await customFieldService.remove(req.params.id);
    res.status(204).end();
  },
};
