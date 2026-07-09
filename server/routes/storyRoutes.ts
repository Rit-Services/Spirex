// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { z } from 'zod';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { storyController } from '../controllers/story/storyController.js';
import { requireEntitlement } from '../middlewares/entitlements.js';
import {
  changeStatusSchema,
  createStorySchema,
  linkIdParamsSchema,
  linkStorySchema,
  reorderStorySchema,
  assignedToMeQuerySchema,
  storyIdParamsSchema,
  storyListQuerySchema,
  updateStorySchema,
} from '../validators/storyValidator.js';
import { moveStoryToSprintSchema } from '../validators/sprintValidator.js';

const router = Router();

router.use(authHandler);

const createStoryBody = createStorySchema.extend({ projectId: z.string().min(1) });

router.get('/', validate({ query: storyListQuerySchema }), asyncHandler(storyController.list));
router.post('/', validate({ body: createStoryBody }), asyncHandler(storyController.create));
// Literal paths BEFORE :id so they don't get shadowed by the id route.
router.get(
  '/assigned-to-me',
  validate({ query: assignedToMeQuerySchema }),
  asyncHandler(storyController.assignedToMe),
);
router.get(
  '/by-key/:key',
  validate({ params: z.object({ key: z.string().min(1) }) }),
  asyncHandler(storyController.getByKey),
);
router.get('/:id', validate({ params: storyIdParamsSchema }), asyncHandler(storyController.get));
router.patch(
  '/:id',
  validate({ params: storyIdParamsSchema, body: updateStorySchema }),
  asyncHandler(storyController.update),
);
router.patch(
  '/:id/status',
  validate({ params: storyIdParamsSchema, body: changeStatusSchema }),
  asyncHandler(storyController.changeStatus),
);
router.patch(
  '/:id/status-row',
  validate({
    params: storyIdParamsSchema,
    body: z.object({
      statusRowId: z.string().min(1),
      // When the target is a done column and this story is a parent, cascade the
      // completion to its still-open subtasks (client "move subtasks too" opt-in).
      cascadeSubtasks: z.boolean().optional(),
    }),
  }),
  asyncHandler(storyController.changeStatusRow),
);
router.patch(
  '/:id/sprint',
  validate({ params: storyIdParamsSchema, body: moveStoryToSprintSchema }),
  asyncHandler(storyController.changeSprint),
);
router.patch(
  '/:id/rank',
  validate({ params: storyIdParamsSchema, body: reorderStorySchema }),
  asyncHandler(storyController.reorder),
);
router.post(
  '/:id/labels',
  validate({ params: storyIdParamsSchema, body: z.object({ labelId: z.string().min(1) }) }),
  asyncHandler(storyController.addLabel),
);
router.delete(
  '/:id/labels/:labelId',
  validate({ params: z.object({ id: z.string().min(1), labelId: z.string().min(1) }) }),
  asyncHandler(storyController.removeLabel),
);
router.get(
  '/:id/watchers',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.watchers),
);
router.post(
  '/:id/watch',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.watch),
);
router.delete(
  '/:id/watch',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.unwatch),
);
router.delete(
  '/:id',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.remove),
);
router.get(
  '/:id/activity',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.activity),
);
router.get(
  '/:id/links',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.listLinks),
);
router.post(
  '/:id/links',
  validate({ params: storyIdParamsSchema, body: linkStorySchema }),
  asyncHandler(storyController.createLink),
);
router.post(
  '/:id/reiterate',
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.reiterate),
);
// AI drafts — gated per-org by the aiEnhance entitlement. Both return a draft
// only; applying it is a normal PATCH /:id the user triggers after reviewing.
router.post(
  '/:id/ai/enhance',
  requireEntitlement('aiEnhance'),
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.aiEnhance),
);
router.post(
  '/:id/ai/acceptance-criteria',
  requireEntitlement('aiEnhance'),
  validate({ params: storyIdParamsSchema }),
  asyncHandler(storyController.aiAcceptanceCriteria),
);
router.delete(
  '/:id/links/:linkId',
  validate({ params: linkIdParamsSchema }),
  asyncHandler(storyController.removeLink),
);

export default router;
