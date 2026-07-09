// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import logger from '../utils/logger.js';

/**
 * Fail-closed configuration guard — runs BEFORE the server accepts any request.
 *
 * Unlike runStartupChecks (a non-fatal health *report* that runs after listen),
 * this is a hard gate: in production a missing or insecure security secret
 * aborts boot with a non-zero exit. The whole point is that an operator who
 * forgets to set JWT_SECRET can never accidentally run a public instance whose
 * auth tokens are signed with a value published in this open-source repo.
 *
 * config/index.ts falls back to this sentinel when JWT_SECRET is unset. Signing
 * real sessions with it would let anyone forge a token, so it must never survive
 * into production.
 */
const INSECURE_JWT_DEFAULT = 'dev_only_insecure_secret';

// A 256-bit secret is 64 hex chars (openssl rand -hex 32). We don't demand that
// exact shape — any high-entropy passphrase is fine — but reject obviously weak
// values so a placeholder like "changeme" can't slip through.
const MIN_SECRET_LENGTH = 16;

/**
 * Assert that security-critical secrets are set to real values. In production a
 * violation calls process.exit(1); elsewhere it logs a warning so local dev and
 * tests still run against the labeled dev fallback.
 */
export function assertProductionConfig(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const problems: string[] = [];

  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (!jwtSecret || jwtSecret === INSECURE_JWT_DEFAULT) {
    problems.push('JWT_SECRET is not set (auth tokens would be signed with a public dev default)');
  } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`JWT_SECRET is too short (< ${MIN_SECRET_LENGTH} chars) — generate one with: openssl rand -hex 32`);
  }

  if (problems.length === 0) return;

  if (isProduction) {
    logger.error('─── Refusing to start: insecure production configuration ───');
    for (const p of problems) logger.error(`[FATAL] ${p}`);
    logger.error('Set the value(s) above and restart. See .env.example / server/env.example.');
    process.exit(1);
  }

  // Non-production: allowed, but make the risk loud so it never reaches prod.
  for (const p of problems) logger.warn(`[insecure-config] ${p} (allowed because NODE_ENV=${process.env.NODE_ENV ?? 'undefined'})`);
}
