// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { worklogService } from '../../services/worklog/worklogService.js';
import { storyService } from '../../services/story/storyService.js';
import { projectService } from '../../services/project/projectService.js';
import { parseTimeToMinutes, TimeParseError } from '../../utils/timeParser.js';
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
    await worklogService.remove(req.params.id, req.user.id, req.orgContext?.role === 'admin');
    res.status(204).end();
  },
};
