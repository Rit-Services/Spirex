// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { epicController } from '../controllers/epic/epicController.js';
import { createEpicSchema, epicIdParamsSchema, updateEpicSchema } from '../validators/epicValidator.js';
import { z } from 'zod';

const router = Router();

router.use(authHandler);

const createEpicBody = createEpicSchema.extend({ projectId: z.string().min(1) });

router.get('/', asyncHandler(epicController.list));
router.post('/', validate({ body: createEpicBody }), asyncHandler(epicController.create));
router.get('/:id', validate({ params: epicIdParamsSchema }), asyncHandler(epicController.get));
router.patch(
  '/:id',
  validate({ params: epicIdParamsSchema, body: updateEpicSchema }),
  asyncHandler(epicController.update),
);
router.delete(
  '/:id',
  validate({ params: epicIdParamsSchema }),
  asyncHandler(epicController.remove),
);

export default router;
