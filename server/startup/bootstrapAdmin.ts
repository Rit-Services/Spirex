// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';

/**
 * First-run provisioning for a self-hosted instance.
 *
 * When the database has NO users yet, create the single initial admin from
 * ADMIN_EMAIL / ADMIN_PASSWORD, plus the organization it administers and the
 * admin membership (which is where authority lives). The admin can then invite
 * the rest of the team in-app.
 *
 * Idempotent and self-limiting: the moment ANY user exists it does nothing — so
 * a later password change, or teammates the admin has added, are never
 * overwritten on the next boot. To rotate the admin password after first run,
 * change it in-app (not via env).
 */
export async function bootstrapAdmin(): Promise<void> {
  // Read at call time (after env is fully loaded), all overridable via env.
  const ORG_NAME = process.env.DEFAULT_ORG_NAME || 'SPIREX';
  const ORG_SLUG = process.env.DEFAULT_ORG_SLUG || 'default';
  // No paid tier in the open-source build, so seats are effectively unlimited.
  const ORG_MAX_USERS = Number(process.env.ORG_MAX_USERS || 1_000_000);
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
  const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.warn(
      'First-run: database is empty but ADMIN_EMAIL / ADMIN_PASSWORD are not set. ' +
        'Set them and restart to auto-create the initial admin account.',
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { slug: ORG_SLUG },
      update: {},
      create: { name: ORG_NAME, slug: ORG_SLUG, maxUsers: ORG_MAX_USERS, status: 'active' },
    });

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = await tx.user.create({
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, passwordHash, globalRole: 'admin' },
    });

    // The org-membership role is the source of truth for authority.
    await tx.orgMembership.create({
      data: { organizationId: org.id, userId: admin.id, role: 'admin' },
    });
  });

  logger.info(`First-run: created initial admin '${ADMIN_EMAIL}' and organization '${ORG_NAME}'.`);
}
