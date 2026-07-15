// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction } from '../../utils/projectAccess.js';
import { importService } from '../../services/ingest/importService.js';
import type { CommitEdit } from '../../services/ingest/importService.js';

// Every gate below routes through assertProjectAction so the target project is
// tenant-scoped to the caller's active org. A record's projectId in another org
// 404s before the role check — closing the cross-tenant IDOR that let any org
// member read/commit imports into another org's projects by id.

export const createDraft = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ErrorResponse.badRequest('No file uploaded');

  const projectId = typeof req.body.projectId === 'string' ? req.body.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  await assertProjectAction(req, projectId, 'import:create');

  const result = await importService.createDraft({
    projectId,
    uploadedById: req.user!.id,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    buffer: req.file.buffer,
  });

  res.status(201).json(result);
});

export const getImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await importService.getById(id);

  await assertProjectAction(req, record.projectId, 'project:view');

  res.json(record);
});

export const listByProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  await assertProjectAction(req, projectId, 'project:view');

  const imports = await importService.listByProject(projectId);
  res.json(imports);
});

export const commitImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await importService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  const edits: CommitEdit[] = Array.isArray(req.body.edits) ? req.body.edits : [];
  const stories = await importService.commit(id, edits, req.user!.id);
  res.json({ committed: stories.length, stories });
});

export const discardImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await importService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  await importService.discard(id);
  res.json({ ok: true });
});
