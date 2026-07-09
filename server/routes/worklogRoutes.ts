// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { worklogController } from '../controllers/worklog/worklogController.js';
import {
  createWorklogSchema,
  updateWorklogSchema,
  worklogIdParamsSchema,
} from '../validators/worklogValidator.js';

const router = Router();
router.use(authHandler);

router.get('/by-story/:storyId', asyncHandler(worklogController.listByStory));
router.post('/', validate({ body: createWorklogSchema }), asyncHandler(worklogController.create));
router.patch(
  '/:id',
  validate({ params: worklogIdParamsSchema, body: updateWorklogSchema }),
  asyncHandler(worklogController.update),
);
router.delete('/:id', validate({ params: worklogIdParamsSchema }), asyncHandler(worklogController.remove));

export default router;
