-- Rename Story.endDate -> Story.dueDate (a single deadline reads truer than an
-- "end date" for a ticket). Story.startDate is intentionally left in place.
--
-- Hand-written to match the repo convention (idempotent guards): every
-- statement is a NO-OP on a database that already has the new shape and
-- performs the rename on one that doesn't, so `prisma migrate deploy` applies
-- it safely in every environment (local dev and prod K8s alike). This only
-- renames — no data is dropped or rewritten; existing values carry over.

-- 1. Column rename, guarded both ways: only fires when the old column still
-- exists and the new one does not yet.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'endDate'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Story' AND column_name = 'dueDate'
  ) THEN
    ALTER TABLE "Story" RENAME COLUMN "endDate" TO "dueDate";
  END IF;
END $$;

-- 2. Index rename to match the default Prisma name for @@index([projectId, dueDate]).
-- IF EXISTS makes this a NO-OP once the index already carries the new name.
ALTER INDEX IF EXISTS "Story_projectId_endDate_idx"
  RENAME TO "Story_projectId_dueDate_idx";
