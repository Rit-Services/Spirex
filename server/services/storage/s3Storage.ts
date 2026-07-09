// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { StorageAdapter } from './storageAdapter.js';

/**
 * S3-compatible object storage adapter. Works against AWS S3 or any
 * compatible server — notably MinIO, which needs `forcePathStyle: true`.
 *
 * The `relativePath`/`destKey` values are used verbatim as object keys, so the
 * bucket layout mirrors the local-disk layout:
 *   <projectKey>/<yyyy-mm>/<cuid>-<slug>.<ext>
 */
export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT;
    const bucket = process.env.MINIO_BUCKET;
    const accessKeyId = process.env.MINIO_ACCESS_KEY;
    const secretAccessKey = process.env.MINIO_SECRET_KEY;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'STORAGE_DRIVER=minio requires MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY and MINIO_SECRET_KEY',
      );
    }
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region: process.env.MINIO_REGION ?? 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      // MinIO serves buckets as path segments, not vhost subdomains.
      forcePathStyle: (process.env.MINIO_FORCE_PATH_STYLE ?? 'true') !== 'false',
    });
  }

  async save({ buffer, destKey }: { buffer: Buffer; destKey: string }) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: destKey, Body: buffer }),
    );
    return destKey;
  }

  async stream(relativePath: string, range?: { start: number; end: number }) {
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: relativePath,
        // S3 Range uses the same inclusive `bytes=start-end` form as HTTP.
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    if (!res.Body) throw new Error(`Empty object body for key: ${relativePath}`);
    return res.Body as Readable;
  }

  async read(relativePath: string) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: relativePath }),
    );
    if (!res.Body) throw new Error(`Empty object body for key: ${relativePath}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async healthCheck() {
    // HeadBucket verifies both connectivity and that the bucket exists and
    // is accessible with the given credentials.
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  /** Human-readable target, for startup logging. */
  describe(): string {
    return `bucket=${this.bucket} @ ${process.env.MINIO_ENDPOINT}`;
  }

  async remove(relativePath: string) {
    // S3 delete is idempotent — a missing key is not an error.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: relativePath }),
    );
  }
}
