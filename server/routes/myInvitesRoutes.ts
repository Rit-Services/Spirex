// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { z } from 'zod';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { inviteController } from '../controllers/invite/inviteController.js';

// Authenticated, self-service org invitations (the in-app bell → /invitations
// flow). Distinct from the PUBLIC token-based accept at /api/auth/invite/:token,
// which is how a brand-new account (no session yet) accepts from an email link.
const router = Router();

router.use(authHandler);

const idParams = z.object({ id: z.string().min(1) });

router.get('/', asyncHandler(inviteController.listMine));
router.post('/:id/accept', validate({ params: idParams }), asyncHandler(inviteController.acceptMine));
router.post('/:id/decline', validate({ params: idParams }), asyncHandler(inviteController.declineMine));

export default router;
