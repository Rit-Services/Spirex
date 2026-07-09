// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { customFieldController } from '../controllers/customField/customFieldController.js';
import {
  createCustomFieldSchema,
  customFieldIdParamsSchema,
  customFieldProjectParamsSchema,
  updateCustomFieldSchema,
} from '../validators/customFieldValidator.js';

const router = Router();
router.use(authHandler);

router.get(
  '/projects/:projectId/custom-fields',
  validate({ params: customFieldProjectParamsSchema }),
  asyncHandler(customFieldController.listForProject),
);

router.post(
  '/projects/:projectId/custom-fields',
  validate({ params: customFieldProjectParamsSchema, body: createCustomFieldSchema }),
  asyncHandler(customFieldController.create),
);

router.patch(
  '/custom-fields/:id',
  validate({ params: customFieldIdParamsSchema, body: updateCustomFieldSchema }),
  asyncHandler(customFieldController.update),
);

router.delete(
  '/custom-fields/:id',
  validate({ params: customFieldIdParamsSchema }),
  asyncHandler(customFieldController.remove),
);

export default router;
