// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { feedbackService } from '../../services/feedback/feedbackService.js';
import logger from '../../utils/logger.js';
import type { FeedbackWebhookPayload } from '../../validators/feedbackWebhookValidator.js';

export const receive = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body as FeedbackWebhookPayload;
  const result = await feedbackService.ingest(payload, req.user!.id);
  logger.info(
    `feedback webhook → story ${result.storyKey} (feedbackId=${payload.feedbackId}, by=${req.user!.email})`,
  );
  res.status(201).json(result);
});
