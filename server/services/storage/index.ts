// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { StorageAdapter } from './storageAdapter.js';
import { LocalDiskStorage } from './localDiskStorage.js';
import { S3Storage } from './s3Storage.js';

/**
 * Active storage backend, selected once at startup by `STORAGE_DRIVER`:
 *   - `local` (default) → local filesystem under UPLOADS_DIR
 *   - `minio` / `s3`    → S3-compatible object store (see s3Storage.ts)
 */
function createStorage(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  switch (driver) {
    case 'minio':
    case 's3':
      return new S3Storage();
    case 'local':
      return new LocalDiskStorage();
    default:
      throw new Error(`Unknown STORAGE_DRIVER: ${driver} (expected 'local' or 'minio')`);
  }
}

export const storageDriver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
export const storage: StorageAdapter = createStorage();
export type { StorageAdapter } from './storageAdapter.js';
