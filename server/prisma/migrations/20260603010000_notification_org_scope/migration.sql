-- Phase 2: scope notifications to an organization.
--
-- Additive + nullable, so it is rollback-safe and needs NO backfill: existing
-- rows stay NULL and the client treats NULL as "all orgs". New rows are stamped
-- by the dispatcher (story event -> story's project org) and by the invite
-- service (org_invite -> the inviting org). The FK cascades on org delete, which
-- matches how the recipient (user) FK already behaves.

ALTER TABLE "Notification" ADD COLUMN "organizationId" TEXT;

CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
