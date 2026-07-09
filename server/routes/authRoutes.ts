// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authController } from '../controllers/auth/authController.js';
import { ssoController } from '../controllers/auth/ssoController.js';
import { validate } from '../middlewares/validationHandler.js';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { loginSchema, changePasswordSchema, updateProfileSchema, ssoDisconnectSchema } from '../validators/authValidator.js';
import inviteRoutes from './inviteRoutes.js';

const router = Router();

router.post('/login', validate({ body: loginSchema }), asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authHandler, asyncHandler(authController.me));
router.patch('/me', authHandler, validate({ body: updateProfileSchema }), asyncHandler(authController.updateProfile));
router.post('/change-password', authHandler, validate({ body: changePasswordSchema }), asyncHandler(authController.changePassword));

// SSO (Microsoft, OIDC). Start + callback are browser redirects, not JSON —
// auth happens INSIDE the flow, so no middleware. Link-vs-login is driven by an
// explicit `intent` in the signed stash (?intent=link from the profile) — NOT
// inferred from an ambient session, which would let a stale cookie hijack a
// sign-in into a silent cross-account link.
router.get('/sso/providers', asyncHandler(ssoController.providers));
router.get('/sso/identities', authHandler, asyncHandler(ssoController.identities));
router.delete('/sso/identities/:provider', authHandler, validate({ body: ssoDisconnectSchema }), asyncHandler(ssoController.disconnect));
router.get('/sso/microsoft', asyncHandler(ssoController.startMicrosoft));
router.get('/sso/microsoft/callback', asyncHandler(ssoController.callbackMicrosoft));

// Public invite-acceptance endpoints — no auth required (the user is not
// signed in yet; the token in the URL is the auth factor).
router.use('/invite', inviteRoutes);

export default router;
