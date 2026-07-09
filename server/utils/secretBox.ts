// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import crypto from 'crypto';
import { config } from '../config/index.js';

/**
 * Reversible encryption for secrets we must read back later — e.g. a saved JIRA
 * API token that has to be replayed against Atlassian on the next import.
 *
 * AES-256-GCM gives us confidentiality AND integrity (the auth tag detects any
 * tampering on decrypt). The 256-bit key is derived once via scrypt from the
 * configured secret, so any passphrase-length string works as ENCRYPTION_KEY.
 *
 * Stored format (dot-separated, all base64):  v1.<iv>.<authTag>.<ciphertext>
 * A version tag fronts the blob so we can rotate the scheme later without a
 * guessing game on existing rows.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce — the GCM standard
const KEY_BYTES = 32; // AES-256
// Fixed salt: the input secret is already high-entropy, so a per-app constant
// salt is sufficient to domain-separate this key from any other scrypt use.
const KEY_SALT = 'spirex.secretbox.v1';
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function derivedKey(): Buffer {
  if (cachedKey) return cachedKey;
  // Prefer a dedicated ENCRYPTION_KEY; fall back to JWT_SECRET so local dev and
  // tests work without extra config. Both are server-only secrets.
  const secret = config.encryption.key || config.jwt.secret;
  cachedKey = crypto.scryptSync(secret, KEY_SALT, KEY_BYTES);
  return cachedKey;
}

/** Encrypt a UTF-8 string into a self-describing, storable blob. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Decrypt a blob produced by {@link encryptSecret}. Throws if the format is
 * unknown or the auth tag fails (tampered ciphertext, or the key changed).
 * Callers that want graceful degradation should catch and treat a failure as
 * "no usable secret" — see jiraConnectionService.
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('secretBox: unsupported or malformed ciphertext');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
