-- Remove the `backlog` value from the StoryStatus enum.
--
-- Backlog membership is now defined PURELY by `sprintId IS NULL`; a story's
-- status is always a real workflow status. Every existing backlog story is
-- re-homed onto To Do (+ its project's default To Do column). Postgres can't
-- drop an enum value in place, so we recreate the type.
--
-- Guarded + idempotent: the whole block no-ops if `backlog` is already gone.
DO $$
DECLARE
  has_backlog boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'StoryStatus' AND e.enumlabel = 'backlog'
  ) INTO has_backlog;

  IF NOT has_backlog THEN
    RETURN; -- already migrated
  END IF;

  -- 1. Point every backlog story at its project's default To Do column so the
  --    statusId stays coherent once the status flips.
  UPDATE "Story" s
  SET "statusId" = (
    SELECT ws.id
    FROM "WorkflowStatus" ws
    WHERE ws."projectId" = s."projectId" AND ws."coreStatus" = 'todo'
    ORDER BY ws."isDefault" DESC, ws."order" ASC
    LIMIT 1
  )
  WHERE s.status = 'backlog';

  -- 2. Flip the status itself.
  UPDATE "Story" SET status = 'todo' WHERE status = 'backlog';

  -- 3. Drop any legacy backlog WorkflowStatus rows (backlog never had a board
  --    column; some early projects may still carry one). Must happen before the
  --    enum cast below, which would otherwise fail on a `backlog` coreStatus.
  DELETE FROM "WorkflowStatus" WHERE "coreStatus" = 'backlog';

  -- 4. Recreate StoryStatus without `backlog`, repointing both columns that use it.
  ALTER TABLE "Story" ALTER COLUMN "status" DROP DEFAULT;
  ALTER TYPE "StoryStatus" RENAME TO "StoryStatus_old";
  CREATE TYPE "StoryStatus" AS ENUM ('todo', 'in_progress', 'in_review', 'qa', 'done');
  ALTER TABLE "Story"
    ALTER COLUMN "status" TYPE "StoryStatus" USING "status"::text::"StoryStatus";
  ALTER TABLE "WorkflowStatus"
    ALTER COLUMN "coreStatus" TYPE "StoryStatus" USING "coreStatus"::text::"StoryStatus";
  ALTER TABLE "Story" ALTER COLUMN "status" SET DEFAULT 'todo';
  DROP TYPE "StoryStatus_old";
END $$;
