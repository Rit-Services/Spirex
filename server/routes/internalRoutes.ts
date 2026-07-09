// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { internalAuthHandler } from '../middlewares/internalAuthHandler.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { internalController } from '../controllers/internal/internalController.js';

// Internal-only endpoints. Not for browsers or API keys — these are called by
// in-cluster jobs and gated by the shared X-Internal-Token secret.
const router = Router();

router.use(internalAuthHandler);

router.post('/digest/weekly', asyncHandler(internalController.runWeeklyDigest));

export default router;
