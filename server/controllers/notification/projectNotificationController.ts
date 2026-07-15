// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { projectNotificationService } from '../../services/notification/projectNotificationService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can, type Action } from '../../utils/permissions.js';
import { resolveProjectActor } from '../../utils/projectAccess.js';

/** Resolve the actor's permission context within a project. The shared boundary
 *  tenant-scopes the project (404 if it's outside the caller's org) before we run
 *  the per-cell can() checks below. Throws 401 when unauthenticated. */
async function resolveActor(req: Request, projectId: string) {
  const { actor } = await resolveProjectActor(req, projectId);
  return actor;
}

function assertAllowed(actor: Parameters<typeof can>[0], action: Action) {
  if (!can(actor, action)) throw ErrorResponse.forbidden();
}

export const projectNotificationController = {
  /**
   * List the project's email opt-ins. A lead/admin (`member:manage`) gets the
   * full member×event set for the matrix; a regular member gets only their OWN
   * rows (they can't see, or edit, anyone else's). `canManageAll` tells the
   * client which mode to render.
   */
  async list(req: Request, res: Response) {
    const { projectId } = req.params;
    const actor = await resolveActor(req, projectId);
    assertAllowed(actor, 'project:view'); // must belong to the project
    const canManageAll = can(actor, 'member:manage');
    const preferences = canManageAll
      ? await projectNotificationService.list(projectId)
      : await projectNotificationService.listForUser(projectId, actor.userId);
    res.json({ preferences, canManageAll });
  },

  /**
   * Upsert one user's event cells. Editing YOUR OWN row needs only project
   * membership; editing someone else's needs `member:manage` (lead/admin).
   */
  async setForUser(req: Request, res: Response) {
    const { projectId, userId } = req.params;
    const actor = await resolveActor(req, projectId);
    if (userId === actor.userId) {
      assertAllowed(actor, 'project:view');
    } else {
      assertAllowed(actor, 'member:manage');
    }
    await projectNotificationService.setMany(projectId, userId, req.body.entries);
    // Echo back only what the actor may see — a regular member never receives
    // anyone else's rows, even in the save response.
    const canManageAll = can(actor, 'member:manage');
    const preferences = canManageAll
      ? await projectNotificationService.list(projectId)
      : await projectNotificationService.listForUser(projectId, actor.userId);
    res.json({ preferences });
  },
};
