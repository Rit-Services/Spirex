-- Phase 12: Voice Import
-- Adds VoiceImport table (one audio clip → one story draft) and the supporting
-- enum + foreign-key plumbing. Audio bytes live in the existing Attachment
-- table (new 'audio' value on AttachmentKind). The transcripts are persisted
-- on the VoiceImport row directly since they are well-structured scalars;
-- everything the user can edit pre-commit lives in the JSONB `draft` column
-- so we can extend the editable fields without further migrations.

-- 1. AttachmentKind gains 'audio' so we can flag audio attachments distinctly
-- from images and documents (e.g. for inline rendering as an audio player).
ALTER TYPE "AttachmentKind" ADD VALUE IF NOT EXISTS 'audio';

-- 2. ActivityEvent gains 'voice_imported' so a committed voice-sourced story
-- has a distinct activity entry from the existing 'imported' (document) and
-- whatever image-import logs today.
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'voice_imported';

-- 3. VoiceImportStatus — new enum, distinct from ImportStatus because the
-- voice lifecycle has external-service intermediate states.
DO $$ BEGIN
  CREATE TYPE "VoiceImportStatus" AS ENUM (
    'pending',
    'transcribing',
    'transcribed',
    'generating',
    'generated',
    'committed',
    'discarded',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. Story gains a nullable FK pointing back to the VoiceImport it was
-- materialized from (mirrors Story.sourceDocumentId and sourceImageImportId).
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "sourceVoiceImportId" TEXT;

-- 5. The VoiceImport table itself.
CREATE TABLE IF NOT EXISTS "VoiceImport" (
  "id"                TEXT                NOT NULL,
  "projectId"         TEXT                NOT NULL,
  "uploadedById"      TEXT                NOT NULL,
  "attachmentId"      TEXT                NOT NULL,
  "status"            "VoiceImportStatus" NOT NULL DEFAULT 'pending',
  "transcriberJobId"  TEXT,
  "langHint"          TEXT,
  "originalText"      TEXT,
  "translatedText"    TEXT,
  "detectedLanguage"  TEXT,
  "durationSeconds"   DOUBLE PRECISION,
  "draft"             JSONB               NOT NULL,
  "error"             TEXT,
  "createdAt"         TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)        NOT NULL,
  "committedAt"       TIMESTAMP(3),
  CONSTRAINT "VoiceImport_pkey" PRIMARY KEY ("id")
);

-- 6. attachmentId is 1-to-1 with Attachment.
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceImport_attachmentId_key"
  ON "VoiceImport"("attachmentId");

-- 7. FKs.
ALTER TABLE "VoiceImport"
  ADD CONSTRAINT "VoiceImport_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceImport"
  ADD CONSTRAINT "VoiceImport_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VoiceImport"
  ADD CONSTRAINT "VoiceImport_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Story"
  ADD CONSTRAINT "Story_sourceVoiceImportId_fkey"
  FOREIGN KEY ("sourceVoiceImportId") REFERENCES "VoiceImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Indexes.
CREATE INDEX IF NOT EXISTS "VoiceImport_projectId_idx"    ON "VoiceImport"("projectId");
CREATE INDEX IF NOT EXISTS "VoiceImport_uploadedById_idx" ON "VoiceImport"("uploadedById");
CREATE INDEX IF NOT EXISTS "VoiceImport_status_idx"       ON "VoiceImport"("status");
CREATE INDEX IF NOT EXISTS "Story_sourceVoiceImportId_idx" ON "Story"("sourceVoiceImportId");
