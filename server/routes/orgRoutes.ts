// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler, requirePermission } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { uploadHandler } from '../middlewares/uploadHandler.js';
import { orgController } from '../controllers/org/orgController.js';
import { updateOrgSelfSchema } from '../validators/organizationValidator.js';

// Tenant-side organization settings (the org admin's own org). Distinct from
// /api/superadmin/* which lets the platform operator manage ANY org.
const router = Router();

router.use(authHandler);

// Logo stream — any authenticated user can view (renders in sidebar/topbar).
router.get('/logo/:id', asyncHandler(orgController.streamLogo));

// Current org — any member can read it (for display).
router.get('/', asyncHandler(orgController.current));

// Mutations require the org-admin capability.
router.patch(
  '/',
  requirePermission('org:manage'),
  validate({ body: updateOrgSelfSchema }),
  asyncHandler(orgController.update),
);
router.post(
  '/logo',
  requirePermission('org:manage'),
  uploadHandler.single('file'),
  asyncHandler(orgController.uploadLogo),
);

export default router;
