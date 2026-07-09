// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { organizationService, logoMimeForPath } from '../../services/org/organizationService.js';
import { organizationModel } from '../../models/org/organization.js';
import { storage } from '../../services/storage/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

// Tenant-side org settings: the org admin manages their OWN organization
// (name, website, logo). Scoped to req.orgContext — never another tenant.
const LOGO_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function requireOrgId(req: Request): string {
  const orgId = req.orgContext?.orgId;
  if (!orgId) throw ErrorResponse.forbidden('No active organization');
  return orgId;
}

export const orgController = {
  async current(req: Request, res: Response) {
    const organization = await organizationService.getById(requireOrgId(req));
    res.json({ organization });
  },

  async update(req: Request, res: Response) {
    const organization = await organizationService.update(requireOrgId(req), req.body);
    res.json({ organization });
  },

  async uploadLogo(req: Request, res: Response) {
    const orgId = requireOrgId(req);
    if (!req.file) throw ErrorResponse.badRequest('No file provided');
    const ext = LOGO_EXT_BY_MIME[req.file.mimetype];
    if (!ext) throw ErrorResponse.badRequest('Logo must be a PNG, JPEG, WebP, or GIF image');
    if (req.file.size > MAX_LOGO_BYTES) throw ErrorResponse.badRequest('Logo too large (max 2 MB)');
    const organization = await organizationService.setLogo(orgId, { buffer: req.file.buffer, ext });
    res.json({ organization });
  },

  // Public-to-authed logo stream. Any signed-in user can render an org logo
  // (it's branding, not sensitive); the cookie is sent automatically by <img>.
  async streamLogo(req: Request, res: Response) {
    const org = await organizationModel.findById(req.params.id);
    if (!org?.logoPath) throw ErrorResponse.notFound('No logo');
    res.setHeader('Content-Type', logoMimeForPath(org.logoPath));
    res.setHeader('Cache-Control', 'private, max-age=300');
    const stream = await storage.stream(org.logoPath);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  },
};
