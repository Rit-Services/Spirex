// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can } from '../../utils/permissions.js';
import { importService } from '../../services/ingest/importService.js';
import type { CommitEdit } from '../../services/ingest/importService.js';
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
  if (!req.file) throw ErrorResponse.badRequest('No file uploaded');

  const projectId = typeof req.body.projectId === 'string' ? req.body.projectId.trim() : '';
  if (!projectId) throw ErrorResponse.badRequest('projectId is required');

  const role = await getMemberRole(projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to import documents in this project');
  }

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

  const imports = await importService.listByProject(projectId);
  res.json(imports);
});

export const commitImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await importService.getById(id);

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to commit imports in this project');
  }

  const edits: CommitEdit[] = Array.isArray(req.body.edits) ? req.body.edits : [];
  const stories = await importService.commit(id, edits, req.user!.id);
  res.json({ committed: stories.length, stories });
});

export const discardImport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await importService.getById(id);

  const role = await getMemberRole(record.projectId, req.user!.id);
  if (!can(actorFor(req, role), 'import:create')) {
    throw ErrorResponse.forbidden('Not allowed to discard imports in this project');
  }

  await importService.discard(id);
  res.json({ ok: true });
});
