// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from './storageAdapter.js';

/**
 * Local filesystem storage adapter.
 * Root is `process.env.UPLOADS_DIR` resolved against the server CWD.
 * Files live at `<root>/<destKey>` where destKey is
 *   <projectKey>/<yyyy-mm>/<cuid>-<slug>.<ext>
 */
export class LocalDiskStorage implements StorageAdapter {
  private readonly root: string;

  constructor(rootDir: string = process.env.UPLOADS_DIR ?? './uploads') {
    this.root = path.resolve(process.cwd(), rootDir);
    fs.mkdirSync(this.root, { recursive: true });
  }

  resolve(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  async save({ buffer, destKey }: { buffer: Buffer; destKey: string }) {
    const abs = this.resolve(destKey);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buffer);
    return destKey;
  }

  async stream(relativePath: string, range?: { start: number; end: number }) {
    // fs.createReadStream treats `end` as inclusive — same semantics as an
    // HTTP Range header — so we can forward start/end verbatim.
    return fs.createReadStream(this.resolve(relativePath), range ? range : undefined);
  }

  async read(relativePath: string) {
    return fsp.readFile(this.resolve(relativePath));
  }

  async healthCheck() {
    // Root is created in the constructor; confirm it is still writable.
    await fsp.access(this.root, fs.constants.W_OK);
  }

  async remove(relativePath: string) {
    try {
      await fsp.unlink(this.resolve(relativePath));
    } catch (err: unknown) {
      // Swallow missing-file errors; anything else re-throws.
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    }
  }
}
