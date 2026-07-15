// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { worklogService } from '../../services/worklog/worklogService.js';
import { storyService } from '../../services/story/storyService.js';
import { parseTimeToMinutes, TimeParseError } from '../../utils/timeParser.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction, resolveProjectActor } from '../../utils/projectAccess.js';

function toMinutesOrThrow(spec: string): number {
  try {
    const n = parseTimeToMinutes(spec);
    if (n == null || n <= 0) throw new Error('empty');
    return n;
  } catch (err) {
    const msg = err instanceof TimeParseError ? err.message : 'Invalid time expression';
    throw ErrorResponse.badRequest(msg);
  }
}

export const worklogController = {
  async listByStory(req: Request, res: Response) {
    const story = await storyService.get(req.params.storyId);
    await assertProjectAction(req, story.projectId, 'project:view');
    const [worklogs, totalMinutes] = await Promise.all([
      worklogService.listByStory(story.id),
      worklogService.sumForStory(story.id),
    ]);
    res.json({ worklogs, totalMinutes });
  },

  async create(req: Request, res: Response) {
    const story = await storyService.get(req.body.storyId);
    await assertProjectAction(req, story.projectId, 'worklog:create');
    if (!req.user) throw ErrorResponse.unauthorized();

    const minutes = toMinutesOrThrow(req.body.timeSpent);
    const rec = await worklogService.create({
      storyId: story.id,
      userId: req.user.id,
      timeSpentMinutes: minutes,
      startedAt: req.body.startedAt ? new Date(req.body.startedAt) : new Date(),
      description: req.body.description ?? null,
    });
    res.status(201).json({ worklog: rec });
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    // Tenant scope: the worklog's project must live in the caller's active org
    // (404 otherwise) before the service applies its author-only check.
    const existing = await worklogService.getById(req.params.id);
    const story = await storyService.get(existing.storyId);
    await resolveProjectActor(req, story.projectId);
    const data: { timeSpentMinutes?: number; startedAt?: Date; description?: string | null } = {};
    if (req.body.timeSpent !== undefined) data.timeSpentMinutes = toMinutesOrThrow(req.body.timeSpent);
    if (req.body.startedAt !== undefined)
      data.startedAt = req.body.startedAt ? new Date(req.body.startedAt) : new Date();
    if (req.body.description !== undefined) data.description = req.body.description;
    const rec = await worklogService.update(req.params.id, req.user.id, data);
    res.json({ worklog: rec });
  },

  async remove(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    // Resolve the worklog's project and org-scope it (404 if it's in another
    // org). The admin override is then keyed to the caller's role IN THIS
    // worklog's org — without the scope, an org admin could delete any other
    // org's worklogs by guessing ids.
    const existing = await worklogService.getById(req.params.id);
    const story = await storyService.get(existing.storyId);
    const { actor } = await resolveProjectActor(req, story.projectId);
    const canManageAny = actor.isSuperAdmin === true || actor.orgRole === 'admin';
    await worklogService.remove(req.params.id, req.user.id, canManageAny);
    res.status(204).end();
  },
};
