// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env') });

/**
 * Open-source seed = first-run provisioning only. It creates the single initial
 * admin + organization from ADMIN_EMAIL / ADMIN_PASSWORD (see startup/bootstrapAdmin.ts)
 * and nothing else — no demo users or sample data. The same bootstrap also runs
 * automatically on server startup, so `docker compose up` provisions the admin
 * without needing this script at all; it's here for the local-dev flow.
 *
 * Dynamic imports so the .env above is loaded BEFORE the Prisma client (and
 * config) initialise from process.env.
 */
async function main(): Promise<void> {
  const { bootstrapAdmin } = await import('../startup/bootstrapAdmin.js');
  const { prisma } = await import('../db/prisma.js');
  try {
    await bootstrapAdmin();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
