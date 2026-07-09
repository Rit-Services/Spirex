// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can } from '../../utils/permissions.js';
import { imageImportService } from '../../services/ingest/imageImportService.js';
import type {
  Annotation,
  CommitImageEdit,
  ImageImportDraft,
} from '../../services/ingest/imageImportService.js';
import type { ProjectRole } from '../../utils/permissions.js';
import { prisma } from '../../db/prisma.js';

function actorFor(req: Request, projectRole?: ProjectRole) {
  return {
    userId: req.user!.id,
    isSuperAdmin: req.user!.isSuperAdmin,
    orgRole: req.orgContext?.role,
    projectRole,
  };
}

async function getMemberRole(projectId: string, userId: string): Promise<ProjectRole | undefined> {
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return m?.projectRole as ProjectRole | undefined;
}

export const createDraft = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw ErrorResponse.badRequest('No image uploaded');

  const projectId = typeof req.body.projectId === 'string' ? req.body.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  const role = await getMemberRole(projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to import images in this project');
  }

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

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'project:view')) {
    throw ErrorResponse.forbidden('Not a project member');
  }

  res.json(record);
});

export const listByProject = asyncHandler(async (req: Request, res: Response) => {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  const role = await getMemberRole(projectId, req.user!.id);
  if (!can(actorFor(req, role), 'project:view')) {
    throw ErrorResponse.forbidden('Not a project member');
  }

  const rows = await imageImportService.listByProject(projectId);
  res.json(rows);
});

export const updateAnnotations = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to edit image imports in this project');
  }

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

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to edit image imports in this project');
  }

  const patch = (req.body.draft ?? {}) as Partial<ImageImportDraft>;
  const updated = await imageImportService.updateDraft(id, patch);
  res.json(updated);
});

export const commitImageImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to commit image imports in this project');
  }

  const edit = (req.body.edit ?? {}) as CommitImageEdit;
  const story = await imageImportService.commit(id, edit, req.user!.id);
  res.json({ story });
});

export const generateDraft = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to generate stories in this project');
  }

  const draft = await imageImportService.generateDraft(id);
  res.json({ draft });
});

export const discardImageImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await imageImportService.getById(id);

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to discard image imports in this project');
  }

  await imageImportService.discard(id);
  res.json({ ok: true });
});
