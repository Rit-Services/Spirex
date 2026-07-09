// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { encryptSecret, decryptSecret } from '../../utils/secretBox.js';
import logger from '../../utils/logger.js';
import type { JiraCredentials } from './jiraClient.js';

/**
 * Per-user persistence for a JIRA Cloud connection. The API token is the only
 * sensitive field — it is encrypted at rest via secretBox and decrypted only
 * here, server-side, when an import needs to call JIRA. The masked view (what
 * the client sees) deliberately omits the token entirely.
 */

/** Safe-to-expose shape — no token, ever. */
export interface MaskedJiraConnection {
  connected: true;
  domain: string;
  email: string;
  displayName: string | null;
  updatedAt: Date;
}

export const jiraConnectionService = {
  /** Persist (or overwrite) the caller's connection, encrypting the token. */
  async save(
    userId: string,
    creds: JiraCredentials,
    meta: { accountId?: string; displayName?: string } = {},
  ): Promise<MaskedJiraConnection> {
    const apiTokenCipher = encryptSecret(creds.apiToken);
    const row = await prisma.jiraConnection.upsert({
      where: { userId },
      create: {
        userId,
        domain: creds.domain,
        email: creds.email,
        apiTokenCipher,
        accountId: meta.accountId ?? null,
        displayName: meta.displayName ?? null,
      },
      update: {
        domain: creds.domain,
        email: creds.email,
        apiTokenCipher,
        accountId: meta.accountId ?? null,
        displayName: meta.displayName ?? null,
      },
    });
    return mask(row);
  },

  /** The masked connection for display, or null if the user has none saved. */
  async getMasked(userId: string): Promise<MaskedJiraConnection | null> {
    const row = await prisma.jiraConnection.findUnique({ where: { userId } });
    return row ? mask(row) : null;
  },

  /**
   * Full decrypted credentials for server-side use, or null if none saved or
   * the stored token can't be decrypted (e.g. the encryption key rotated). A
   * decrypt failure is treated as "no usable connection" so the caller can
   * prompt the user to reconnect instead of 500-ing.
   */
  async getCredentials(userId: string): Promise<JiraCredentials | null> {
    const row = await prisma.jiraConnection.findUnique({ where: { userId } });
    if (!row) return null;
    try {
      return { domain: row.domain, email: row.email, apiToken: decryptSecret(row.apiTokenCipher) };
    } catch (err) {
      logger.error('jiraConnection: token decrypt failed — treating as unset', err);
      return null;
    }
  },

  /** Forget the caller's saved connection. Idempotent. */
  async remove(userId: string): Promise<void> {
    await prisma.jiraConnection.deleteMany({ where: { userId } });
  },
};

function mask(row: {
  domain: string;
  email: string;
  displayName: string | null;
  updatedAt: Date;
}): MaskedJiraConnection {
  return {
    connected: true,
    domain: row.domain,
    email: row.email,
    displayName: row.displayName,
    updatedAt: row.updatedAt,
  };
}
