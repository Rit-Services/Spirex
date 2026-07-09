-- External "unlinked" users: JIRA people who don't map to a real Spirex account
-- on import. They attribute imported work truthfully (reporter/assignee/author/
-- epic creator) as "Name (unlinked)", never log in, hold no membership, consume
-- no seat. Idempotent so `migrate deploy` (prod applies on boot) is re-runnable.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isExternal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "externalSource" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- Dedup ghosts per source account (JIRA accountId). All-NULL rows (every real
-- user) are treated as distinct by Postgres, so this never blocks normal users.
CREATE UNIQUE INDEX IF NOT EXISTS "User_externalSource_externalId_key"
  ON "User" ("externalSource", "externalId");

CREATE INDEX IF NOT EXISTS "User_isExternal_idx" ON "User" ("isExternal");
