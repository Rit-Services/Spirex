// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import multer from 'multer';
import path from 'node:path';

// Per-kind size caps. Videos get a much larger cap (300 MB) because screen
// recordings — especially QuickTime .mov from macOS — are inherently large;
// everything else stays at 25 MB. The global multer limit is the video cap
// (the larger of the two); per-kind enforcement happens in the controller
// after multer has buffered the file so we know the real size.
export const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_UPLOAD_BYTES || 300 * 1024 * 1024);
export const MAX_DEFAULT_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);

const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  // Video — QuickTime/Mac screen recordings land here. Safari sometimes
  // reports .mov as `video/quicktime`; some browsers use `video/x-quicktime`.
  'video/mp4',
  'video/quicktime',
  'video/x-quicktime',
  'video/webm',
  'video/x-matroska',
  // Audio — voice notes and uploaded clips. `audio/webm`/`audio/ogg` are what
  // browser MediaRecorder produces; the rest cover common uploaded files.
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/x-m4a',
]);

// Extension fallback — Windows browsers sometimes report .md/.txt as
// application/octet-stream when no MIME type is registered in the OS.
// Same trick covers .mov when the browser sends `application/octet-stream`.
const ALLOWED_EXTS = new Set([
  '.md',
  '.txt',
  '.pdf',
  '.docx',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  '.flac',
]);

export function isVideoUpload(mimetype: string, filename: string): boolean {
  if (mimetype.startsWith('video/')) return true;
  // An explicit audio MIME wins over the ambiguous `.webm` extension below —
  // `audio/webm` must NOT be treated as a video (wrong cap + wrong Content-Type).
  if (mimetype.startsWith('audio/')) return false;
  const ext = path.extname(filename).toLowerCase();
  return ext === '.mov' || ext === '.mp4' || ext === '.webm' || ext === '.mkv';
}

export const uploadHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(MAX_VIDEO_BYTES, MAX_DEFAULT_BYTES), files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIMES.has(file.mimetype) && !ALLOWED_EXTS.has(ext)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});
