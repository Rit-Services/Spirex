// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import crypto from 'crypto';
import { apiKeyModel, type UserApiKey } from '../../models/apiKey/apiKey.js';
import { userModel } from '../../models/user/user.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import logger from '../../utils/logger.js';
import type { AuthUser } from '../../middlewares/authHandler.js';

const KEY_PREFIX = 'spx_';
// Length of the random portion that lives inside the indexed prefix column.
// Together with KEY_PREFIX this yields prefix = "spx_xxxxxxxx" — 12 chars.
const PREFIX_RAND_LEN = 8;
// Total random bytes in the secret; base64url-encoded → ~43 chars.
const KEY_RANDOM_BYTES = 32;

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildKey(): { plaintext: string; prefix: string; keyHash: string } {
  const token = crypto.randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const plaintext = `${KEY_PREFIX}${token}`;
  const prefix = `${KEY_PREFIX}${token.slice(0, PREFIX_RAND_LEN)}`;
  const keyHash = sha256Hex(plaintext);
  return { plaintext, prefix, keyHash };
}

function publicView(row: UserApiKey) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export interface CreateApiKeyInput {
  userId: string;
  name: string;
  expiresAt?: Date | null;
}

export const apiKeyService = {
  async create(input: CreateApiKeyInput) {
    if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
      throw ErrorResponse.badRequest('expiresAt must be in the future');
    }

    const { plaintext, prefix, keyHash } = buildKey();
    const row = await apiKeyModel.create({
      userId: input.userId,
      name: input.name,
      prefix,
      keyHash,
      expiresAt: input.expiresAt ?? null,
    });

    return { key: publicView(row), plaintext };
  },

  async list(userId: string) {
    const rows = await apiKeyModel.listByUser(userId);
    return rows.map(publicView);
  },

  async revoke(id: string, userId: string) {
    const row = await apiKeyModel.findByIdForUser(id, userId);
    if (!row) throw ErrorResponse.notFound('API key not found');
    if (row.revokedAt) return publicView(row);
    const updated = await apiKeyModel.revoke(id);
    return publicView(updated);
  },

  /**
   * Resolve a raw `spx_…` key to an AuthUser. Returns null when the key is
   * malformed, unknown, revoked, expired, or owned by a disabled user.
   * Touches lastUsedAt as a best-effort side-effect.
   */
  async resolveKey(rawKey: string): Promise<AuthUser | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;

    const tokenPart = rawKey.slice(KEY_PREFIX.length);
    if (tokenPart.length < PREFIX_RAND_LEN) return null;

    const prefix = `${KEY_PREFIX}${tokenPart.slice(0, PREFIX_RAND_LEN)}`;
    const row = await apiKeyModel.findByPrefix(prefix);
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

    const incomingHash = sha256Hex(rawKey);
    const a = Buffer.from(incomingHash, 'hex');
    const b = Buffer.from(row.keyHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const user = await userModel.findById(row.userId);
    if (!user || user.disabledAt) return null;

    // Fire-and-forget — don't block the request on the audit write.
    apiKeyModel
      .touchLastUsed(row.id)
      .catch((err) => logger.warn('apiKey touchLastUsed failed', err));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    };
  },
};
