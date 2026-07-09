// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router, json } from 'express';
import { validate } from '../middlewares/validationHandler.js';
import { requireApiKey } from '../middlewares/authHandler.js';
import { feedbackWebhookSchema } from '../validators/feedbackWebhookValidator.js';
import * as feedbackController from '../controllers/feedback/feedbackController.js';

const router = Router();

router.post(
  '/feedback',
  json({ limit: '5mb' }),
  requireApiKey,
  validate({ body: feedbackWebhookSchema }),
  feedbackController.receive,
);

export default router;
