-- Adds 'video' to AttachmentKind so screen recordings (e.g. QuickTime .mov)
-- and other video uploads get their own kind for inline <video> rendering.
ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'video';
