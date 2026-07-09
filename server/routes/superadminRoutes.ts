// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler, requireSuperAdmin } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { uploadHandler } from '../middlewares/uploadHandler.js';
import { organizationController } from '../controllers/superadmin/organizationController.js';
import { platformAdminController } from '../controllers/superadmin/platformAdminController.js';
import {
  adminIdParamsSchema,
  createMemberSchema,
  createOrgSchema,
  createSuperAdminSchema,
  inviteMemberSchema,
  lookupMemberQuerySchema,
  memberParamsSchema,
  memberRoleSchema,
  orgIdParamsSchema,
  searchQuerySchema,
  updateOrgSchema,
} from '../validators/organizationValidator.js';

// Platform-operator routes. Every request must be the superadmin — guarded once
// at the router level, so individual handlers don't repeat the check.
const router = Router();

router.use(authHandler, requireSuperAdmin);

// Command-bar search (organizations + members). Declared before the
// parameterised org routes — distinct path, but kept up top for visibility.
router.get(
  '/search',
  validate({ query: searchQuerySchema }),
  asyncHandler(organizationController.search),
);

router.get('/organizations', asyncHandler(organizationController.list));
router.post(
  '/organizations',
  validate({ body: createOrgSchema }),
  asyncHandler(organizationController.create),
);

router.get(
  '/organizations/:id',
  validate({ params: orgIdParamsSchema }),
  asyncHandler(organizationController.get),
);
router.patch(
  '/organizations/:id',
  validate({ params: orgIdParamsSchema, body: updateOrgSchema }),
  asyncHandler(organizationController.update),
);
router.post(
  '/organizations/:id/suspend',
  validate({ params: orgIdParamsSchema }),
  asyncHandler(organizationController.suspend),
);
router.post(
  '/organizations/:id/reactivate',
  validate({ params: orgIdParamsSchema }),
  asyncHandler(organizationController.reactivate),
);

// Members — provision and manage any org's people from the platform dashboard.
router.get(
  '/organizations/:id/members',
  validate({ params: orgIdParamsSchema }),
  asyncHandler(organizationController.listMembers),
);
// Distinct sub-path — declared near the roster route for visibility. No
// GET /members/:userId exists, so there's no param-vs-literal collision.
router.get(
  '/organizations/:id/members/lookup',
  validate({ params: orgIdParamsSchema, query: lookupMemberQuerySchema }),
  asyncHandler(organizationController.lookupMember),
);
router.post(
  '/organizations/:id/members',
  validate({ params: orgIdParamsSchema, body: createMemberSchema }),
  asyncHandler(organizationController.addMember),
);
// Invite an existing-or-new account into this org (cross-org join / set-password).
router.post(
  '/organizations/:id/invites',
  validate({ params: orgIdParamsSchema, body: inviteMemberSchema }),
  asyncHandler(organizationController.inviteMember),
);
router.patch(
  '/organizations/:id/members/:userId',
  validate({ params: memberParamsSchema, body: memberRoleSchema }),
  asyncHandler(organizationController.setMemberRole),
);
router.delete(
  '/organizations/:id/members/:userId',
  validate({ params: memberParamsSchema }),
  asyncHandler(organizationController.removeMember),
);

// Org logo (superadmin can set any org's branding).
router.post(
  '/organizations/:id/logo',
  validate({ params: orgIdParamsSchema }),
  uploadHandler.single('file'),
  asyncHandler(organizationController.uploadLogo),
);

// Platform superadmins — list / create another / revoke.
router.get('/admins', asyncHandler(platformAdminController.list));
router.post(
  '/admins',
  validate({ body: createSuperAdminSchema }),
  asyncHandler(platformAdminController.create),
);
router.delete(
  '/admins/:id',
  validate({ params: adminIdParamsSchema }),
  asyncHandler(platformAdminController.revoke),
);

export default router;
