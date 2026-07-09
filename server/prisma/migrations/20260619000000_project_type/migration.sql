-- Project methodology type (scrum | kanban). Additive + idempotent: safe to
-- re-run, and existing projects default to 'scrum' (the current behaviour).

DO $$ BEGIN
  CREATE TYPE "ProjectType" AS ENUM ('scrum', 'kanban');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "type" "ProjectType" NOT NULL DEFAULT 'scrum';
