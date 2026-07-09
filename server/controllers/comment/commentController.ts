// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { commentService } from '../../services/comment/commentService.js';
import { storyService } from '../../services/story/storyService.js';
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

export const commentController = {
  async listByStory(req: Request, res: Response) {
    const story = await storyService.get(req.params.storyId);
    await assertProjectAction(req, story.projectId, 'project:view');
    const comments = await commentService.listByStory(story.id);
    res.json({ comments });
  },

  async create(req: Request, res: Response) {
    const story = await storyService.get(req.body.storyId);
    await assertProjectAction(req, story.projectId, 'comment:create');
    if (!req.user) throw ErrorResponse.unauthorized();
    const comment = await commentService.create({
      storyId: story.id,
      authorId: req.user.id,
      body: req.body.body,
    });
    res.status(201).json({ comment });
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const comment = await commentService.update(req.params.id, req.user.id, req.body.body);
    res.json({ comment });
  },

  async remove(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    await commentService.remove(req.params.id, req.user.id, req.orgContext?.role === 'admin');
    res.status(204).end();
  },
};
