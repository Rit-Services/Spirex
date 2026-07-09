// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { sprintController } from '../controllers/sprint/sprintController.js';
import {
  completeSprintSchema,
  createSprintSchema,
  sprintIdParamsSchema,
  updateSprintSchema,
} from '../validators/sprintValidator.js';

const router = Router();

router.use(authHandler);

router.get('/', asyncHandler(sprintController.list));
router.post('/', validate({ body: createSprintSchema }), asyncHandler(sprintController.create));
router.get('/:id', validate({ params: sprintIdParamsSchema }), asyncHandler(sprintController.get));
router.get(
  '/:id/detail',
  validate({ params: sprintIdParamsSchema }),
  asyncHandler(sprintController.detail),
);
router.patch(
  '/:id',
  validate({ params: sprintIdParamsSchema, body: updateSprintSchema }),
  asyncHandler(sprintController.update),
);
router.post(
  '/:id/start',
  validate({ params: sprintIdParamsSchema }),
  asyncHandler(sprintController.start),
);
router.post(
  '/:id/complete',
  validate({ params: sprintIdParamsSchema, body: completeSprintSchema }),
  asyncHandler(sprintController.complete),
);
router.delete(
  '/:id',
  validate({ params: sprintIdParamsSchema }),
  asyncHandler(sprintController.remove),
);
router.get(
  '/:id/burndown',
  validate({ params: sprintIdParamsSchema }),
  asyncHandler(sprintController.burndown),
);

export default router;
