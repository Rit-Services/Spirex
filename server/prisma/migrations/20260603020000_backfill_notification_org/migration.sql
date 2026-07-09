-- Phase 2: backfill organizationId on EXISTING notifications.
--
-- The 20260603010000 migration added the column nullable with no backfill, so
-- every pre-existing row is NULL — which makes the bell's per-org filter and the
-- cross-org switch-on-click no-ops for historical notifications. This sets the
-- org deterministically from each notification's story -> project -> org.
--
-- Data-only and idempotent: it touches ONLY rows that are still NULL and only
-- those linked to a still-existing story. Nothing is deleted; re-running is a
-- no-op. org_invite rows (no storyId) stay NULL — they route to /invitations and
-- never switch context, so they need no org.

UPDATE "Notification" AS n
SET "organizationId" = p."organizationId"
FROM "Story" s
JOIN "Project" p ON p."id" = s."projectId"
WHERE n."storyId" = s."id"
  AND n."organizationId" IS NULL;
