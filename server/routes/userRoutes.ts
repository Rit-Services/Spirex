// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { userController } from '../controllers/user/userController.js';
import { validate } from '../middlewares/validationHandler.js';
import { authHandler, requirePermission } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import {
  createUserSchema,
  inviteMemberSchema,
  lookupQuerySchema,
  userIdParamsSchema,
  resetPasswordSchema,
  updateGlobalRoleSchema,
  updateUserSchema,
} from '../validators/userValidator.js';

const router = Router();

router.use(authHandler);

// Directory is open to any authenticated user — needed by the project-settings
// member picker so non-admin members can pick teammates to invite.
router.get('/directory', asyncHandler(userController.directory));

router.use(requirePermission('user:manage'));

router.get('/', asyncHandler(userController.list));
router.post('/', validate({ body: createUserSchema }), asyncHandler(userController.create));
// Phase 2: live "account exists?" check + email-first invite (new or cross-org).
router.get('/lookup', validate({ query: lookupQuerySchema }), asyncHandler(userController.lookup));
router.post('/invite', validate({ body: inviteMemberSchema }), asyncHandler(userController.invite));
// Admin-side pending-invite visibility + resend. Registered BEFORE '/:id' so the
// literal path isn't swallowed by the user-detail param route.
router.get('/pending-invites', asyncHandler(userController.pendingInvites));
router.post(
  '/pending-invites/:id/resend',
  validate({ params: userIdParamsSchema }),
  asyncHandler(userController.resendInvite),
);
router.get(
  '/:id',
  validate({ params: userIdParamsSchema }),
  asyncHandler(userController.detail),
);
router.patch(
  '/:id',
  validate({ params: userIdParamsSchema, body: updateUserSchema }),
  asyncHandler(userController.update),
);
router.patch(
  '/:id/disable',
  validate({ params: userIdParamsSchema }),
  asyncHandler(userController.disable),
);
router.patch(
  '/:id/enable',
  validate({ params: userIdParamsSchema }),
  asyncHandler(userController.enable),
);
router.post(
  '/:id/reset-password',
  validate({ params: userIdParamsSchema, body: resetPasswordSchema }),
  asyncHandler(userController.resetPassword),
);
router.patch(
  '/:id/global-role',
  validate({ params: userIdParamsSchema, body: updateGlobalRoleSchema }),
  asyncHandler(userController.updateGlobalRole),
);

export default router;
