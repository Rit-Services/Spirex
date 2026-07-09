// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { commentController } from '../controllers/comment/commentController.js';
import {
  createCommentSchema,
  updateCommentSchema,
  commentIdParamsSchema,
} from '../validators/commentValidator.js';

const router = Router();
router.use(authHandler);

router.get('/by-story/:storyId', asyncHandler(commentController.listByStory));
router.post('/', validate({ body: createCommentSchema }), asyncHandler(commentController.create));
router.patch(
  '/:id',
  validate({ params: commentIdParamsSchema, body: updateCommentSchema }),
  asyncHandler(commentController.update),
);
router.delete('/:id', validate({ params: commentIdParamsSchema }), asyncHandler(commentController.remove));

export default router;
