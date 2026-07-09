// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { projectNotificationController } from '../controllers/notification/projectNotificationController.js';
import {
  projectNotifParamsSchema,
  projectNotifUserParamsSchema,
  setProjectNotifSchema,
} from '../validators/projectNotificationValidator.js';

const router = Router();
router.use(authHandler);

router.get(
  '/projects/:projectId/notification-preferences',
  validate({ params: projectNotifParamsSchema }),
  asyncHandler(projectNotificationController.list),
);

router.put(
  '/projects/:projectId/notification-preferences/:userId',
  validate({ params: projectNotifUserParamsSchema, body: setProjectNotifSchema }),
  asyncHandler(projectNotificationController.setForUser),
);

export default router;
