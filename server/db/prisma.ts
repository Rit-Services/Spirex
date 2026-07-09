// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.LOG_LEVEL === 'debug' ? ['query', 'error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Sanity check — every model our code touches at runtime must exist on the
 * generated client. If it doesn't, the schema was changed without running
 * `prisma generate` and callsites would otherwise blow up with a confusing
 * "Cannot read properties of undefined (reading 'create')" deep in a service.
 */
const REQUIRED_DELEGATES = [
  'user',
  'organization',
  'orgMembership',
  'project',
  'projectMember',
  'epic',
  'sprint',
  'story',
  'storyLink',
  'worklog',
  'comment',
  'attachment',
  'activityLog',
] as const;
const missing = REQUIRED_DELEGATES.filter(
  (key) => !(key in (prisma as unknown as Record<string, unknown>)),
);
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    `[prisma] Generated client is missing: ${missing.join(', ')}.\n` +
      `Run: cd server && npx prisma generate && npx prisma migrate deploy`,
  );
  throw new Error(
    `Prisma client is out of date — missing delegates: ${missing.join(', ')}. ` +
      `Re-run "npx prisma generate" in server/.`,
  );
}
