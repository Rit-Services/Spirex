// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { commentService } from '../../services/comment/commentService.js';
import { storyService } from '../../services/story/storyService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction, resolveProjectActor } from '../../utils/projectAccess.js';

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
    // Tenant scope: the comment's project must live in the caller's active org
    // (404 otherwise) before the service applies its author-only check.
    const existing = await commentService.getById(req.params.id);
    const story = await storyService.get(existing.storyId);
    await resolveProjectActor(req, story.projectId);
    const comment = await commentService.update(req.params.id, req.user.id, req.body.body);
    res.json({ comment });
  },

  async remove(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    // Resolve the comment's project and org-scope it (404 if it's in another
    // org). The admin override is then keyed to the caller's role IN THIS
    // comment's org — without the scope, an org admin could delete any other
    // org's comments by guessing ids.
    const existing = await commentService.getById(req.params.id);
    const story = await storyService.get(existing.storyId);
    const { actor } = await resolveProjectActor(req, story.projectId);
    const canManageAny = actor.isSuperAdmin === true || actor.orgRole === 'admin';
    await commentService.remove(req.params.id, req.user.id, canManageAny);
    res.status(204).end();
  },
};
