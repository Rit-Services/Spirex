// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { labelController } from '../controllers/label/labelController.js';
import {
  createLabelSchema,
  labelIdParamsSchema,
  projectIdParamsSchema,
  updateLabelSchema,
} from '../validators/labelValidator.js';

const router = Router();
router.use(authHandler);

router.get(
  '/projects/:projectId/labels',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(labelController.listForProject),
);

router.post(
  '/projects/:projectId/labels',
  validate({ params: projectIdParamsSchema, body: createLabelSchema }),
  asyncHandler(labelController.create),
);

router.patch(
  '/labels/:id',
  validate({ params: labelIdParamsSchema, body: updateLabelSchema }),
  asyncHandler(labelController.update),
);

router.delete(
  '/labels/:id',
  validate({ params: labelIdParamsSchema }),
  asyncHandler(labelController.remove),
);

export default router;
