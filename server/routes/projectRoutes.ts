// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler, requirePermission } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import {
  projectController,
  projectMemberController,
  unlinkedUserController,
} from '../controllers/project/projectController.js';
import {
  createProjectSchema,
  projectIdParamsSchema,
  projectMemberParamsSchema,
  updateProjectSchema,
  upsertMemberSchema,
  linkUnlinkedUserParamsSchema,
  linkUnlinkedUserSchema,
} from '../validators/projectValidator.js';

const router = Router();

router.use(authHandler);

router.get('/', asyncHandler(projectController.list));
router.post(
  '/',
  requirePermission('project:create'),
  validate({ body: createProjectSchema }),
  asyncHandler(projectController.create),
);

router.get('/:id', validate({ params: projectIdParamsSchema }), asyncHandler(projectController.get));
router.patch(
  '/:id',
  validate({ params: projectIdParamsSchema, body: updateProjectSchema }),
  asyncHandler(projectController.update),
);
router.delete(
  '/:id',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(projectController.remove),
);

router.get(
  '/:id/members',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(projectMemberController.list),
);
router.put(
  '/:id/members',
  validate({ params: projectIdParamsSchema, body: upsertMemberSchema }),
  asyncHandler(projectMemberController.upsert),
);
router.delete(
  '/:id/members/:userId',
  validate({ params: projectMemberParamsSchema }),
  asyncHandler(projectMemberController.remove),
);

router.get(
  '/:id/unlinked-users',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(unlinkedUserController.list),
);
router.post(
  '/:id/unlinked-users/:ghostId/link',
  validate({ params: linkUnlinkedUserParamsSchema, body: linkUnlinkedUserSchema }),
  asyncHandler(unlinkedUserController.link),
);

export default router;
