// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import path from 'node:path';
import type { Request, Response } from 'express';
import { attachmentService } from '../../services/attachment/attachmentService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { assertProjectAction } from '../../utils/projectAccess.js';
import { storage } from '../../services/storage/index.js';
import {
  MAX_VIDEO_BYTES,
  MAX_DEFAULT_BYTES,
  isVideoUpload,
} from '../../middlewares/uploadHandler.js';

// Map audio extensions to a sensible MIME for the octet-stream fallback.
const AUDIO_EXT_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};

// Browsers don't always send a useful MIME — macOS QuickTime reports .mov as
// application/octet-stream, and Windows does the same for audio files with no
// registered type. Normalize by extension so downstream (kind mapping,
// Content-Type on serve) treats them as the real media type.
function normalizedMime(mimetype: string, filename: string): string {
  if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) return mimetype;
  const ext = path.extname(filename).toLowerCase();
  if (isVideoUpload(mimetype, filename)) {
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.mp4') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    if (ext === '.mkv') return 'video/x-matroska';
  }
  if (AUDIO_EXT_MIME[ext]) return AUDIO_EXT_MIME[ext];
  return mimetype;
}

/**
 * Parse a single-range HTTP `Range` header (`bytes=start-end`) against the
 * total size. Returns the inclusive `[start, end]` window, or null when the
 * header is unparseable/unsatisfiable (caller answers 416). Only single ranges
 * are supported — the sole form browsers use to seek media.
 */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startStr, endStr] = m;
  if (startStr === '' && endStr === '') return null;

  let start: number;
  let end: number;
  if (startStr === '') {
    // Suffix form `bytes=-N` → the final N bytes.
    const n = Number(endStr);
    if (n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Number(endStr);
  }
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start < 0 || start >= size || start > end) return null;
  if (end >= size) end = size - 1;
  return { start, end };
}

export const attachmentController = {
  async listByStory(req: Request, res: Response) {
    const rows = await attachmentService.listByStory(req.params.storyId);
    if (rows[0]) await assertProjectAction(req, rows[0].projectId, 'project:view');
    res.json({ attachments: rows });
  },

  async create(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    if (!req.file) throw ErrorResponse.badRequest('No file provided');
    const projectId = String(req.body.projectId || '');
    const storyId = (req.body.storyId as string | undefined) || null;
    await assertProjectAction(req, projectId, 'attachment:upload');

    const mimetype = normalizedMime(req.file.mimetype, req.file.originalname);
    const isVideo = isVideoUpload(mimetype, req.file.originalname);
    const cap = isVideo ? MAX_VIDEO_BYTES : MAX_DEFAULT_BYTES;
    if (req.file.size > cap) {
      const capMb = Math.round(cap / 1024 / 1024);
      const kindLabel = isVideo ? 'Video' : 'File';
      throw ErrorResponse.badRequest(
        `${kindLabel} too large (${Math.round(req.file.size / 1024 / 1024)} MB). Max is ${capMb} MB.`,
      );
    }

    const rec = await attachmentService.create({
      projectId,
      storyId,
      uploadedById: req.user.id,
      filename: req.file.originalname,
      mimetype,
      buffer: req.file.buffer,
    });
    res.status(201).json({
      attachment: {
        ...rec,
        url: `/api/attachments/${rec.id}/file`,
      },
    });
  },

  async stream(req: Request, res: Response) {
    const att = await attachmentService.findById(req.params.id);
    if (!att) throw ErrorResponse.notFound('Attachment not found');
    await assertProjectAction(req, att.projectId, 'project:view');

    const total = att.sizeBytes;
    // Advertise range support unconditionally so browsers know they may seek
    // (videos won't expose a scrubbable timeline without this).
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', att.mimetype);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${att.filename.replace(/"/g, '')}"`,
    );

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const parsed = parseRange(rangeHeader, total);
      if (!parsed) {
        res.setHeader('Content-Range', `bytes */${total}`);
        res.status(416).end();
        return;
      }
      const { start, end } = parsed;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      const stream = await storage.stream(att.path, { start, end });
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', String(total));
    const stream = await storage.stream(att.path);
    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  },

  async remove(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const att = await attachmentService.findById(req.params.id);
    if (!att) throw ErrorResponse.notFound('Attachment not found');
    // Uploader OR project-scoped delete permission.
    const isUploader = att.uploadedById === req.user.id;
    if (!isUploader) {
      await assertProjectAction(req, att.projectId, 'attachment:delete');
    }
    await attachmentService.remove(req.params.id, req.user.id);
    res.status(204).end();
  },
};
