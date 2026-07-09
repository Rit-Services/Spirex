-- Phase 9A.2 — Custom workflow columns
--
-- Drops the "one row per coreStatus" constraint so admins can add custom
-- columns (e.g. two "In Progress" variants). Adds Story.statusId so the board
-- can place a story in a SPECIFIC column — otherwise multiple columns sharing
-- a coreStatus would duplicate-render the same card.

BEGIN;

-- 1. Swap the unique index for a regular lookup index.
DROP INDEX IF EXISTS "WorkflowStatus_projectId_coreStatus_key";
CREATE INDEX IF NOT EXISTS "WorkflowStatus_projectId_coreStatus_idx"
  ON "WorkflowStatus"("projectId", "coreStatus");

-- 2. Story.statusId — nullable FK, lets existing seed/stories keep working
--    while we backfill. Old code reads `Story.status` (enum); new code reads
--    `Story.statusId` and falls back to the enum when null.
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "statusId" TEXT;

-- 3. Backfill: point every story at the default WorkflowStatus row that
--    matches its current core status. `isDefault = true` picks the original
--    seeded row; if someone already dropped that flag we fall back to any
--    matching row.
UPDATE "Story" s
SET "statusId" = (
  SELECT ws."id"
  FROM "WorkflowStatus" ws
  WHERE ws."projectId" = s."projectId"
    AND ws."coreStatus" = s."status"
  ORDER BY ws."isDefault" DESC, ws."order" ASC
  LIMIT 1
)
WHERE s."statusId" IS NULL;

-- 4. FK constraint (SetNull so deleting a row won't cascade-delete stories).
ALTER TABLE "Story"
  ADD CONSTRAINT "Story_statusId_fkey"
  FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Story_projectId_statusId_idx"
  ON "Story"("projectId", "statusId");

COMMIT;
