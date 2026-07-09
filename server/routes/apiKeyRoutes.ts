// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { apiKeyController } from '../controllers/apiKey/apiKeyController.js';
import {
  apiKeyIdParamsSchema,
  createApiKeySchema,
} from '../validators/apiKeyValidator.js';

const router = Router();

router.use(authHandler);

router.get('/', asyncHandler(apiKeyController.list));
router.post(
  '/',
  validate({ body: createApiKeySchema }),
  asyncHandler(apiKeyController.create),
);
router.delete(
  '/:id',
  validate({ params: apiKeyIdParamsSchema }),
  asyncHandler(apiKeyController.revoke),
);

export default router;
