// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Phase 13 — create / promote the platform superadmin.
 *
 * The superadmin is a PURE platform operator: NO org membership, NO seat.
 * Idempotent — re-running updates the password and re-asserts superadmin.
 *
 * Run (PowerShell):
 *   cd server
 *   $env:PLATFORM_OWNER_EMAIL="you@example.com"
 *   $env:PLATFORM_OWNER_PASSWORD="<a-strong-password>"
 *   npx tsx prisma/create-superadmin.ts
 *
 * Optional: PLATFORM_OWNER_NAME (defaults to "Platform Owner").
 *
 * FAIL-CLOSED on purpose: there are NO default credentials. Both env vars are
 * required — a script that falls back to a baked-in email/password would hand
 * every unconfigured deployment a superadmin with publicly known credentials.
 */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env') });

import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL = (process.env.PLATFORM_OWNER_EMAIL || '').trim();
const PASSWORD = process.env.PLATFORM_OWNER_PASSWORD || '';
const NAME = process.env.PLATFORM_OWNER_NAME || 'Platform Owner';

async function main() {
  if (!EMAIL || !EMAIL.includes('@')) {
    console.error('[superadmin] Set PLATFORM_OWNER_EMAIL before running — there is no default.');
    process.exit(1);
  }
  if (!PASSWORD || PASSWORD.length < 8) {
    console.error('[superadmin] Set PLATFORM_OWNER_PASSWORD (min 8 chars) before running — there is no default.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { isSuperAdmin: true, passwordHash, disabledAt: null },
    create: { email: EMAIL, name: NAME, passwordHash, isSuperAdmin: true },
  });

  // Pure operator: ensure no org memberships / seats are held.
  const removed = await prisma.orgMembership.deleteMany({ where: { userId: user.id } });

  console.log(
    `[superadmin] OK — ${EMAIL} (${user.id}) isSuperAdmin=true` +
      (removed.count ? `; removed ${removed.count} org membership(s)` : ''),
  );
}

main()
  .catch((err) => {
    console.error('[superadmin] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
