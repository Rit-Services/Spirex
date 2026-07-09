-- Phase 9A.1 — Custom workflow labels / colors / order
--
-- Purely additive: adds a per-project `WorkflowStatus` table that lets admins
-- customize column labels, colors, and ordering. Each row is pinned to a core
-- `StoryStatus` enum value so `Story.status` keeps working as-is. The enum
-- remains the system source of truth; the table is presentation metadata.

BEGIN;

-- 1. Category enum for workflow groupings on the board (todo / in_progress / done).
CREATE TYPE "StatusCategory" AS ENUM ('todo', 'in_progress', 'done');

-- 2. Extend the ActivityEvent enum so future status-change logs can carry
--    label metadata. (Read-side only for now; legacy `status_changed` writes
--    continue unchanged.)
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'workflow_status_changed';

-- 3. Workflow table.
CREATE TABLE "WorkflowStatus" (
    "id"         TEXT             NOT NULL,
    "projectId"  TEXT             NOT NULL,
    "coreStatus" "StoryStatus"    NOT NULL,
    "label"      TEXT             NOT NULL,
    "color"      TEXT             NOT NULL DEFAULT '#64748B',
    "order"      INTEGER          NOT NULL,
    "category"   "StatusCategory" NOT NULL,
    "isDefault"  BOOLEAN          NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "WorkflowStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowStatus_projectId_coreStatus_key"
  ON "WorkflowStatus"("projectId", "coreStatus");
CREATE INDEX "WorkflowStatus_projectId_order_idx"
  ON "WorkflowStatus"("projectId", "order");

ALTER TABLE "WorkflowStatus"
  ADD CONSTRAINT "WorkflowStatus_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Seed six defaults per existing project. Deterministic ids (sha of
--    projectId + coreStatus) make the seed idempotent across re-runs.
INSERT INTO "WorkflowStatus"
  ("id", "projectId", "coreStatus", "label", "color", "order", "category", "isDefault", "createdAt", "updatedAt")
SELECT
  encode(sha256((p."id" || ':' || k.core)::bytea), 'hex') AS id,
  p."id",
  k.core::"StoryStatus",
  k.label,
  k.color,
  k.ord,
  k.category::"StatusCategory",
  true,
  NOW(),
  NOW()
FROM "Project" p
CROSS JOIN (VALUES
  ('backlog',     'Backlog',      '#94A3B8', 0, 'todo'),
  ('todo',        'To Do',        '#64748B', 1, 'todo'),
  ('in_progress', 'In Progress',  '#3B82F6', 2, 'in_progress'),
  ('in_review',   'In Review',    '#8B5CF6', 3, 'in_progress'),
  ('qa',          'QA',           '#F59E0B', 4, 'in_progress'),
  ('done',        'Done',         '#10B981', 5, 'done')
) AS k(core, label, color, ord, category)
ON CONFLICT ("projectId", "coreStatus") DO NOTHING;

COMMIT;
