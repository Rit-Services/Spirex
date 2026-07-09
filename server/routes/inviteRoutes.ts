// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { inviteController } from '../controllers/invite/inviteController.js';
import { validate } from '../middlewares/validationHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { acceptInviteSchema, inviteTokenParamsSchema } from '../validators/userValidator.js';

const router = Router();

// Public endpoints — invitee is not authenticated yet.
router.get(
  '/:token',
  validate({ params: inviteTokenParamsSchema }),
  asyncHandler(inviteController.validate),
);

router.post(
  '/:token/accept',
  validate({ params: inviteTokenParamsSchema, body: acceptInviteSchema }),
  asyncHandler(inviteController.accept),
);

export default router;
