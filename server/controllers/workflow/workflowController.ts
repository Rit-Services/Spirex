// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { workflowService } from '../../services/workflow/workflowService.js';
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

export const workflowController = {
  async listForProject(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'project:view');
    // Self-healing: projects created before Phase 9A.1 may not have workflow
    // rows yet. Seed on first read — idempotent, never double-creates.
    const existing = await prisma.workflowStatus.count({ where: { projectId } });
    if (existing === 0) {
      await workflowService.seedDefaults(projectId);
    }
    const rows = await workflowService.list(projectId);
    res.json({ workflow: rows });
  },

  async updateOne(req: Request, res: Response) {
    const row = await prisma.workflowStatus.findUnique({ where: { id: req.params.id } });
    if (!row) throw ErrorResponse.notFound('Workflow status not found');
    await assertProjectAction(req, row.projectId, 'workflow:edit');
    const updated = await workflowService.update(req.params.id, req.body);
    res.json({ status: updated });
  },

  async bulkUpdate(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'workflow:edit');
    const items = req.body.items as Array<{
      id: string;
      label?: string;
      color?: string;
      order?: number;
      category?: 'todo' | 'in_progress' | 'done';
      wipLimit?: number | null;
    }>;
    // Verify every id belongs to this project before mutating — prevents a
    // cross-project smash if the client posts a stale/foreign id.
    const found = await prisma.workflowStatus.findMany({
      where: { projectId, id: { in: items.map((i) => i.id) } },
      select: { id: true },
    });
    const foundIds = new Set(found.map((f) => f.id));
    const foreign = items.filter((i) => !foundIds.has(i.id));
    if (foreign.length > 0) {
      throw ErrorResponse.badRequest('One or more rows do not belong to this project');
    }
    await prisma.$transaction(
      items.map((i) =>
        prisma.workflowStatus.update({
          where: { id: i.id },
          data: {
            label: i.label?.trim() ?? undefined,
            color: i.color ?? undefined,
            order: i.order ?? undefined,
            category: i.category ?? undefined,
            // null clears the WIP limit; undefined leaves it untouched.
            wipLimit: i.wipLimit === undefined ? undefined : i.wipLimit,
            // NEVER touch `isDefault` here. The client only sends the rows whose
            // order/label changed (a reordered default row IS in this set), so
            // forcing `false` silently strips the default flag off real default
            // rows — which then breaks reset/changeStatus fallbacks. Ownership of
            // `isDefault` belongs solely to seedDefaults (true) / createColumn (false).
          },
        }),
      ),
    );
    // Return the FULL, ordered list — not just the updated subset. The client
    // sends only the dirty rows, so echoing back just those would drop the
    // untouched rows from the store and make them vanish from the UI.
    const workflow = await workflowService.list(projectId);
    res.json({ workflow });
  },

  async resetDefaults(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'workflow:edit');
    const rows = await workflowService.resetToDefaults(projectId);
    res.json({ workflow: rows });
  },

  async createColumn(req: Request, res: Response) {
    const { projectId } = req.params;
    await assertProjectAction(req, projectId, 'workflow:edit');
    const row = await workflowService.createColumn({
      projectId,
      coreStatus: req.body.coreStatus,
      label: req.body.label,
      color: req.body.color,
      category: req.body.category,
      order: req.body.order,
    });
    res.status(201).json({ status: row });
  },

  async deleteColumn(req: Request, res: Response) {
    const row = await prisma.workflowStatus.findUnique({ where: { id: req.params.id } });
    if (!row) throw ErrorResponse.notFound('Workflow status not found');
    await assertProjectAction(req, row.projectId, 'workflow:edit');
    await workflowService.removeColumn(req.params.id);
    res.status(204).end();
  },
};
