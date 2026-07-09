// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Readable } from 'node:stream';

/**
 * Pluggable storage abstraction. Local disk and MinIO/S3 implementations live
 * side by side; the active one is chosen by `STORAGE_DRIVER` (see ./index.ts).
 */
export interface StorageAdapter {
  /** Persist the file and return the *relative* path used to retrieve it. */
  save(input: { buffer: Buffer; destKey: string }): Promise<string>;
  /**
   * Open a read stream for an already-stored file. When `range` is given, only
   * the inclusive byte window `[start, end]` is streamed — this is what makes
   * HTTP Range / 206 responses possible so `<video>`/`<audio>` can seek.
   */
  stream(relativePath: string, range?: { start: number; end: number }): Promise<Readable>;
  /** Read an already-stored file fully into memory. */
  read(relativePath: string): Promise<Buffer>;
  /** Remove a stored file. Missing files are non-fatal. */
  remove(relativePath: string): Promise<void>;
  /**
   * Absolute path on disk. Local-only helper — object stores have no disk
   * path, so this is optional and absent on the S3/MinIO adapter.
   */
  resolve?(relativePath: string): string;
  /**
   * Liveness probe — resolves if the backend is reachable/usable, rejects
   * otherwise. Used by the startup health report.
   */
  healthCheck(): Promise<void>;
}
