// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { ErrorResponse } from '../utils/errorResponse.js';

/**
 * Guards internal-only endpoints (e.g. the weekly-digest trigger). The caller
 * is the in-cluster k8s CronJob, which presents the shared secret in the
 * `X-Internal-Token` header. If no token is configured the whole internal
 * surface is disabled — a safe default that keeps it off in dev.
 */
export function internalAuthHandler(req: Request, _res: Response, next: NextFunction) {
  const expected = config.internal.apiToken;
  if (!expected) {
    throw ErrorResponse.forbidden('Internal API is disabled');
  }
  const provided = req.header('x-internal-token');
  if (!provided || provided !== expected) {
    throw ErrorResponse.unauthorized('Invalid internal token');
  }
  next();
}
