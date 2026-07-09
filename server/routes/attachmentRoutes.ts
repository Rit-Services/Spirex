// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { uploadHandler } from '../middlewares/uploadHandler.js';
import { attachmentController } from '../controllers/attachment/attachmentController.js';
import { attachmentIdParamsSchema } from '../validators/attachmentValidator.js';

const router = Router();

router.use(authHandler);

router.get('/by-story/:storyId', asyncHandler(attachmentController.listByStory));
router.post('/', uploadHandler.single('file'), asyncHandler(attachmentController.create));
router.get(
  '/:id/file',
  validate({ params: attachmentIdParamsSchema }),
  asyncHandler(attachmentController.stream),
);
router.delete(
  '/:id',
  validate({ params: attachmentIdParamsSchema }),
  asyncHandler(attachmentController.remove),
);

export default router;
