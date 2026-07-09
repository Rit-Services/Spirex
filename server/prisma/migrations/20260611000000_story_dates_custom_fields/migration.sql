-- Story scheduling dates + Jira-style custom fields (v1).
--
-- Hand-written to match the repo convention (idempotent guards): every
-- statement is a NO-OP on a database that already has these objects and
-- CREATES them on one that doesn't, so `prisma migrate deploy` applies it
-- safely in every environment (local dev and prod K8s alike). Everything here
-- is ADDITIVE — no column drops, no data rewrites.

-- 1. ActivityEvent gains the two new activity entries. Kept first and
-- standalone-safe: Postgres forbids USING a freshly-added enum value in the
-- same transaction that added it (we only add them here).
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'dates_changed';
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'custom_field_changed';

-- 2. CustomFieldType — the admin-selectable field kinds (v1 set).
DO $$ BEGIN
  CREATE TYPE "CustomFieldType" AS ENUM (
    'text',
    'number',
    'date',
    'select',
    'checkbox'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Story gains an optional scheduling window (mirrors Epic/Sprint dates).
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);

-- 4. Date-range lookup indexes (mirror the @@index lines in schema.prisma).
CREATE INDEX IF NOT EXISTS "Story_projectId_startDate_idx"
  ON "Story"("projectId", "startDate");
CREATE INDEX IF NOT EXISTS "Story_projectId_endDate_idx"
  ON "Story"("projectId", "endDate");

-- 5. Project-scoped custom field definitions (the "schema" an admin designs).
-- `options` is a JSON string array, only meaningful for type=select.
CREATE TABLE IF NOT EXISTS "CustomFieldDefinition" (
  "id"         TEXT              NOT NULL,
  "projectId"  TEXT              NOT NULL,
  "name"       TEXT              NOT NULL,
  "type"       "CustomFieldType" NOT NULL,
  "options"    JSONB             NOT NULL DEFAULT '[]',
  "isRequired" BOOLEAN           NOT NULL DEFAULT false,
  "order"      INTEGER           NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)      NOT NULL,
  CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomFieldDefinition_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldDefinition_projectId_name_key"
  ON "CustomFieldDefinition"("projectId", "name");
CREATE INDEX IF NOT EXISTS "CustomFieldDefinition_projectId_order_idx"
  ON "CustomFieldDefinition"("projectId", "order");

-- 6. One value per (story, field). JSON value column serves every field type;
-- deleting the story OR the definition cascades the value rows away.
CREATE TABLE IF NOT EXISTS "CustomFieldValue" (
  "id"        TEXT         NOT NULL,
  "storyId"   TEXT         NOT NULL,
  "fieldId"   TEXT         NOT NULL,
  "value"     JSONB        NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomFieldValue_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "Story"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_fieldId_fkey"
    FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldValue_storyId_fieldId_key"
  ON "CustomFieldValue"("storyId", "fieldId");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_idx"
  ON "CustomFieldValue"("fieldId");
