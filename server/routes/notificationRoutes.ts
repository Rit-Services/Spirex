// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { z } from 'zod';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { notificationController } from '../controllers/notification/notificationController.js';
import {
  listNotificationsQuerySchema,
  updatePreferencesSchema,
} from '../validators/notificationValidator.js';

const router = Router();

router.use(authHandler);

router.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  asyncHandler(notificationController.list),
);
router.get('/unread-count', asyncHandler(notificationController.unreadCount));
// Preference grid — declared before `/:id/read` so neither shadows the other.
router.get('/preferences', asyncHandler(notificationController.getPreferences));
router.put(
  '/preferences',
  validate({ body: updatePreferencesSchema }),
  asyncHandler(notificationController.updatePreferences),
);
router.patch(
  '/read-all',
  asyncHandler(notificationController.markAllRead),
);
router.patch(
  '/:id/read',
  validate({ params: z.object({ id: z.string().min(1) }) }),
  asyncHandler(notificationController.markRead),
);

export default router;
