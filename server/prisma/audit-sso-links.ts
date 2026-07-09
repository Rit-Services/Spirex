// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * SSO link audit — READ ONLY. Lists every AuthIdentity whose provider email
 * does NOT match the linked user's account email. Written after the MS SSO
 * "login silently links to an ambient session" fix (see ssoController): the
 * buggy flow could bind a Microsoft account to a mismatched SPIREX account, and
 * such a stray link keeps signing that MS account into the wrong account until
 * the row is removed. This script only REPORTS — it deletes nothing.
 *
 *   cd server && tsx prisma/audit-sso-links.ts
 *
 * A mismatch is NOT proof of abuse: a user may have deliberately linked a
 * Microsoft account whose email differs from their SPIREX email. Review each
 * row (especially recent createdAt values) before removing anything.
 */
import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(process.cwd(), process.env.NODE_ENV === 'test' ? '.env.test' : '.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

async function main() {
  const identities = await prisma.authIdentity.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      provider: true,
      providerUserId: true,
      email: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, disabledAt: true } },
    },
  });

  // Cross-email links: the provider (e.g. Microsoft) email differs from the
  // linked SPIREX account's email. These are the rows the bug could produce.
  const mismatches = identities.filter((i) => norm(i.email) !== norm(i.user.email));

  console.log(
    `[sso-audit] ${identities.length} identity row(s) total; ` +
      `${mismatches.length} with a provider-email ≠ account-email mismatch.\n`,
  );

  if (mismatches.length === 0) {
    console.log('[sso-audit] No cross-email links found. Nothing to review.');
    return;
  }

  console.log('[sso-audit] REVIEW these (a stranger\'s provider email on someone else\'s account is the red flag):\n');
  for (const i of mismatches) {
    console.log(
      [
        `identityId=${i.id}`,
        `provider=${i.provider}`,
        `providerUserId=${i.providerUserId}`,
        `providerEmail=${i.email || '(none)'}`,
        `→ account=${i.user.email}`,
        `accountName=${i.user.name ?? '(none)'}`,
        `accountId=${i.user.id}`,
        i.user.disabledAt ? 'ACCOUNT_DISABLED' : '',
        `linkedAt=${i.createdAt.toISOString()}`,
      ]
        .filter(Boolean)
        .join('  '),
    );
  }

  console.log(
    `\n[sso-audit] To remove a confirmed-bad link (run manually, after review):\n` +
      `  DELETE FROM "AuthIdentity" WHERE id = '<identityId>';\n` +
      `[sso-audit] READ-ONLY run complete — nothing was modified.`,
  );
}

main()
  .catch((err) => {
    console.error('[sso-audit] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
