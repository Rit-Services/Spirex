// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { ErrorResponse } from '../utils/errorResponse.js';
import logger from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof ErrorResponse) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  // Multer upload failures (size, mimetype, field count) → clean 400.
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message, details: { code: err.code } });
    return;
  }
  // Non-Multer-typed errors thrown from fileFilter also surface here.
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = String((err as { message?: string }).message ?? '');
    if (msg.startsWith('File type not allowed')) {
      res.status(400).json({ error: msg });
      return;
    }
  }

  // Prisma unique-constraint
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002') {
    res.status(409).json({ error: 'Duplicate value', details: (err as { meta?: unknown }).meta });
    return;
  }

  logger.error('unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
