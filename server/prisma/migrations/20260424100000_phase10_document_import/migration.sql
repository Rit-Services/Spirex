-- Phase 10: Document Import
-- Adds ImportStatus enum, DocumentImport table, Story.sourceDocumentId FK,
-- and the 'imported' value to the ActivityEvent enum.

-- Add 'imported' value to ActivityEvent enum
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'imported';

-- Create ImportStatus enum
DO $$ BEGIN
  CREATE TYPE "ImportStatus" AS ENUM ('pending', 'committed', 'discarded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add sourceDocumentId column to Story (nullable FK, added before the table)
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "sourceDocumentId" TEXT;

-- Create DocumentImport table
CREATE TABLE IF NOT EXISTS "DocumentImport" (
  "id"               TEXT         NOT NULL,
  "projectId"        TEXT         NOT NULL,
  "uploadedById"     TEXT         NOT NULL,
  "status"           "ImportStatus" NOT NULL DEFAULT 'pending',
  "draftPayload"     JSONB        NOT NULL,
  "originalFilename" TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committedAt"      TIMESTAMP(3),
  CONSTRAINT "DocumentImport_pkey" PRIMARY KEY ("id")
);

-- Add FK from DocumentImport to Project
ALTER TABLE "DocumentImport"
  ADD CONSTRAINT "DocumentImport_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add FK from DocumentImport to User
ALTER TABLE "DocumentImport"
  ADD CONSTRAINT "DocumentImport_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add FK from Story to DocumentImport (sourceDocumentId)
ALTER TABLE "Story"
  ADD CONSTRAINT "Story_sourceDocumentId_fkey"
  FOREIGN KEY ("sourceDocumentId") REFERENCES "DocumentImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "DocumentImport_projectId_idx" ON "DocumentImport"("projectId");
CREATE INDEX IF NOT EXISTS "DocumentImport_uploadedById_idx" ON "DocumentImport"("uploadedById");
CREATE INDEX IF NOT EXISTS "Story_sourceDocumentId_idx" ON "Story"("sourceDocumentId");
