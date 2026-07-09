// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { validate } from '../middlewares/validationHandler.js';
import { workflowController } from '../controllers/workflow/workflowController.js';
import {
  bulkUpdateWorkflowSchema,
  createWorkflowColumnSchema,
  projectIdParamsSchema,
  updateWorkflowStatusSchema,
  workflowIdParamsSchema,
} from '../validators/workflowValidator.js';

const router = Router();
router.use(authHandler);

router.get(
  '/projects/:projectId/workflow',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(workflowController.listForProject),
);

router.put(
  '/projects/:projectId/workflow',
  validate({ params: projectIdParamsSchema, body: bulkUpdateWorkflowSchema }),
  asyncHandler(workflowController.bulkUpdate),
);

router.post(
  '/projects/:projectId/workflow/reset',
  validate({ params: projectIdParamsSchema }),
  asyncHandler(workflowController.resetDefaults),
);

router.post(
  '/projects/:projectId/workflow/columns',
  validate({ params: projectIdParamsSchema, body: createWorkflowColumnSchema }),
  asyncHandler(workflowController.createColumn),
);

router.patch(
  '/workflow-statuses/:id',
  validate({ params: workflowIdParamsSchema, body: updateWorkflowStatusSchema }),
  asyncHandler(workflowController.updateOne),
);

router.delete(
  '/workflow-statuses/:id',
  validate({ params: workflowIdParamsSchema }),
  asyncHandler(workflowController.deleteColumn),
);

export default router;
