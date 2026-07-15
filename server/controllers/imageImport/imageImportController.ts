// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction } from '../../utils/projectAccess.js';
import { imageImportService } from '../../services/ingest/imageImportService.js';
import type {
  Annotation,
  CommitImageEdit,
  ImageImportDraft,
} from '../../services/ingest/imageImportService.js';

// Every gate below routes through assertProjectAction so the target project is
// tenant-scoped to the caller's active org. A record's projectId in another org
// 404s before the role check — closing the cross-tenant IDOR that let any org
// member read/commit image imports into another org's projects by id.

export const createDraft = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ErrorResponse.badRequest('No image uploaded');

  const projectId = typeof req.body.projectId === 'string' ? req.body.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  await assertProjectAction(req, projectId, 'import:create');

  const result = await imageImportService.createDraft({
    projectId,
    uploadedById: req.user!.id,
    filename: req.file.originalname,
    mimetype: req.file.mimetype,
    buffer: req.file.buffer,
  });

  res.status(201).json(result);
});

export const getImageImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  await assertProjectAction(req, record.projectId, 'project:view');

  res.json(record);
});

export const listByProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  await assertProjectAction(req, projectId, 'project:view');

  const rows = await imageImportService.listByProject(projectId);
  res.json(rows);
});

export const updateAnnotations = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  const annotations = Array.isArray(req.body.annotations)
    ? (req.body.annotations as Annotation[])
    : null;
  if (!annotations) throw ErrorResponse.badRequest('annotations must be an array');

  const updated = await imageImportService.updateAnnotations(id, annotations);
  res.json(updated);
});

export const updateDraft = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  const patch = (req.body.draft ?? {}) as Partial<ImageImportDraft>;
  const updated = await imageImportService.updateDraft(id, patch);
  res.json(updated);
});

export const commitImageImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  const edit = (req.body.edit ?? {}) as CommitImageEdit;
  const story = await imageImportService.commit(id, edit, req.user!.id);
  res.json({ story });
});

export const generateDraft = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  const draft = await imageImportService.generateDraft(id);
  res.json({ draft });
});

export const discardImageImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  await assertProjectAction(req, record.projectId, 'import:create');

  await imageImportService.discard(id);
  res.json({ ok: true });
});
