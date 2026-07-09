-- Voice agent (Phase 5): schema for the conversational voice→ticket agent.
--
-- This feature was developed against a `db push`ed database, so no migration
-- was ever generated for it. This file is that migration, hand-written to match
-- the repo convention (idempotent guards). Every statement is a NO-OP on a
-- database that already has these objects (local dev, post-`db push`) and
-- CREATES them on one that doesn't (prod), so `prisma migrate deploy` applies it
-- safely in every environment.

-- 1. ActivityEvent gains 'voice_agent_created' — a distinct activity entry for
-- tickets created through the voice agent (vs 'voice_imported' / 'imported').
-- Kept first and standalone-safe: Postgres forbids USING a freshly-added enum
-- value in the same transaction that added it (we only add it here).
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'voice_agent_created';

-- 2. VoiceAgentSessionStatus — single-use session lifecycle (replay defense).
DO $$ BEGIN
  CREATE TYPE "VoiceAgentSessionStatus" AS ENUM (
    'pending',
    'used'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Story gains a free-form provenance marker. 'voice-agent' is stamped on
-- tickets created by the voice agent; relational imports keep using source*Id.
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- 4. The VoiceAgentSession table — short-TTL, single-use principal binding a
-- conversation to the authenticated user + their frozen allow-list. orgId /
-- projectId / committedStory* fill in at commit. No FKs by design: the row is
-- ephemeral and nothing should cascade from it.
CREATE TABLE IF NOT EXISTS "VoiceAgentSession" (
  "id"                TEXT                      NOT NULL,
  "conversationId"    TEXT,
  "userId"            TEXT                      NOT NULL,
  "orgId"             TEXT,
  "projectId"         TEXT,
  "allowedProjects"   JSONB                     NOT NULL,
  "status"            "VoiceAgentSessionStatus" NOT NULL DEFAULT 'pending',
  "expiresAt"         TIMESTAMP(3)              NOT NULL,
  "usedAt"            TIMESTAMP(3),
  "committedStoryId"  TEXT,
  "committedStoryKey" TEXT,
  "createdAt"         TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceAgentSession_pkey" PRIMARY KEY ("id")
);

-- 5. conversationId is optional but unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS "VoiceAgentSession_conversationId_key"
  ON "VoiceAgentSession"("conversationId");

-- 6. Lookup indexes (mirror the @@index lines in schema.prisma).
CREATE INDEX IF NOT EXISTS "VoiceAgentSession_userId_idx"
  ON "VoiceAgentSession"("userId");
CREATE INDEX IF NOT EXISTS "VoiceAgentSession_expiresAt_idx"
  ON "VoiceAgentSession"("expiresAt");
