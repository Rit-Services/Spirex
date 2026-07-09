-- Microsoft SSO (Phase 1): external identity links.
--
-- Hand-written to match the repo convention (idempotent guards): every
-- statement is a NO-OP on a database that already has these objects and
-- CREATES them on one that doesn't, so `prisma migrate deploy` applies it
-- safely in every environment. Purely ADDITIVE — no User changes (passwordHash
-- stays NOT NULL; SSO-only users simply never use theirs).
--
-- One row per (provider, providerUserId). Identity lookup is by the immutable
-- provider subject (Entra `oid`), never by email; `email` is a display
-- snapshot taken at link time.
CREATE TABLE IF NOT EXISTS "AuthIdentity" (
  "id"             TEXT         NOT NULL,
  "userId"         TEXT         NOT NULL,
  "provider"       TEXT         NOT NULL,
  "providerUserId" TEXT         NOT NULL,
  "email"          TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthIdentity_provider_providerUserId_key"
  ON "AuthIdentity"("provider", "providerUserId");
CREATE INDEX IF NOT EXISTS "AuthIdentity_userId_idx"
  ON "AuthIdentity"("userId");
