// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import dotenv from 'dotenv';
import path from 'node:path';

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import logger from './utils/logger.js';
import routes from './routes/index.js';
import { runStartupChecks } from './startup/startupChecks.js';
import { assertProductionConfig } from './startup/prodGuard.js';
import { bootstrapAdmin } from './startup/bootstrapAdmin.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();
// One proxy hop (the k8s ingress / local dev proxy) — makes req.ip the real
// client address instead of the proxy's, which per-IP rate limiting needs.
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(requestLogger);

app.use('/api', routes);

app.use(errorHandler);

async function start(): Promise<void> {
  // Fail-closed gate: in production, refuse to boot with a missing/insecure
  // JWT_SECRET rather than silently signing tokens with the public dev default.
  // Runs before anything listens; may process.exit(1).
  assertProductionConfig();

  // First-run: create the initial admin + org from env if the DB is empty.
  // Never fatal — a bootstrap failure shouldn't stop the server from booting.
  await bootstrapAdmin().catch((err) => {
    logger.error('first-run admin bootstrap failed', err);
  });

  app.listen(PORT, () => {
    logger.info(`server listening on :${PORT} (env=${process.env.NODE_ENV})`);
    // Fire-and-forget: probe dependencies and print the health block. Never let
    // a check failure crash the process — the report itself is the deliverable.
    runStartupChecks().catch((err) => {
      logger.error('startup health checks crashed', err);
    });
  });
}

void start();
