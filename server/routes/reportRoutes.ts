// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { reportController } from '../controllers/report/reportController.js';

const router = Router();
router.use(authHandler);

router.get('/overview', asyncHandler(reportController.overview));
router.get('/burndown', asyncHandler(reportController.burndown));
router.get('/velocity', asyncHandler(reportController.velocity));
router.get('/time-per-user', asyncHandler(reportController.timePerUser));
router.get('/status-breakdown', asyncHandler(reportController.statusBreakdown));
router.get('/type-breakdown', asyncHandler(reportController.typeBreakdown));
router.get('/estimate-vs-logged', asyncHandler(reportController.estimateVsLogged));
router.get('/time-tracking', asyncHandler(reportController.timeTracking));
router.get('/worklog-explorer', asyncHandler(reportController.worklogExplorer));

export default router;
