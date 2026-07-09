-- Phase 11: Image Import
-- Adds ImageImport table (one image → one story draft, with annotation overlay
-- stored as JSON), and Story.sourceImageImportId FK that lets a committed
-- story remember which image-import it came from.
--
-- Reuses the existing ImportStatus enum (pending | committed | discarded) and
-- the existing Attachment table — the uploaded image lives in Attachment, and
-- ImageImport just points at it via attachmentId.

-- Add sourceImageImportId column to Story (nullable FK, added before the table)
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "sourceImageImportId" TEXT;

-- Create ImageImport table
CREATE TABLE IF NOT EXISTS "ImageImport" (
  "id"           TEXT           NOT NULL,
  "projectId"    TEXT           NOT NULL,
  "uploadedById" TEXT           NOT NULL,
  "attachmentId" TEXT           NOT NULL,
  "status"       "ImportStatus" NOT NULL DEFAULT 'pending',
  "annotations"  JSONB          NOT NULL DEFAULT '[]',
  "draft"        JSONB          NOT NULL,
  "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt"  TIMESTAMP(3),
  CONSTRAINT "ImageImport_pkey" PRIMARY KEY ("id")
);

-- attachmentId is 1-to-1 with the underlying Attachment row
CREATE UNIQUE INDEX IF NOT EXISTS "ImageImport_attachmentId_key"
  ON "ImageImport"("attachmentId");

-- FKs
ALTER TABLE "ImageImport"
  ADD CONSTRAINT "ImageImport_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImageImport"
  ADD CONSTRAINT "ImageImport_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImageImport"
  ADD CONSTRAINT "ImageImport_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Story"
  ADD CONSTRAINT "Story_sourceImageImportId_fkey"
  FOREIGN KEY ("sourceImageImportId") REFERENCES "ImageImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "ImageImport_projectId_idx"    ON "ImageImport"("projectId");
CREATE INDEX IF NOT EXISTS "ImageImport_uploadedById_idx" ON "ImageImport"("uploadedById");
CREATE INDEX IF NOT EXISTS "Story_sourceImageImportId_idx" ON "Story"("sourceImageImportId");
