// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { digestService } from '../../services/digest/digestService.js';
import logger from '../../utils/logger.js';

export const internalController = {
  /** Triggered by the weekly-digest k8s CronJob. Runs the digest synchronously
   * and returns the send stats so the CronJob log shows what happened. */
  async runWeeklyDigest(_req: Request, res: Response) {
    logger.info('internal: weekly digest run triggered');
    const result = await digestService.runWeekly();
    res.json(result);
  },
};
