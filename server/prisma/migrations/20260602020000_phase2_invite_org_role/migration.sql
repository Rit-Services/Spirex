-- Phase 2: invites carry the target org + role so membership can be created
-- (and seat-checked) AT ACCEPT — this is what enables cross-org "join my org"
-- invites of an already-existing account.
--
-- Both columns are NULLABLE and backfilled, the index/FK are additive: nothing
-- is dropped or rewritten, so this is safe to apply on the running cluster and
-- is fully rollback-safe. Existing (legacy password-reset) invites just keep
-- both columns NULL — the accept path treats a NULL org as "set password only".
ALTER TABLE "Invite" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Invite" ADD COLUMN "role" "GlobalRole";

CREATE INDEX "Invite_organizationId_idx" ON "Invite"("organizationId");

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
