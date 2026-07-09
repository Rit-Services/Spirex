-- Phase 14: project-scoped EMAIL notification preferences + delivery ledger.
--
-- Additive only and fully idempotent (every object is guarded), so a re-apply
-- on boot — the prod deploy model — is safe. The unique dedupeKey on
-- EmailDeliveryLog is the hard "email a user at most once per event" guarantee
-- that backs the UNION-with-personal-grid semantics in notificationService.

-- CreateEnum (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProjectNotificationEvent') THEN
    CREATE TYPE "ProjectNotificationEvent" AS ENUM ('status_changed', 'ticket_completed', 'sprint_completed');
  END IF;
END$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectNotificationPreference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" "ProjectNotificationEvent" NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailDeliveryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "event" "ProjectNotificationEvent" NOT NULL,
    "storyId" TEXT,
    "sprintId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectNotificationPreference_projectId_userId_event_key"
  ON "ProjectNotificationPreference"("projectId", "userId", "event");
CREATE INDEX IF NOT EXISTS "ProjectNotificationPreference_projectId_idx"
  ON "ProjectNotificationPreference"("projectId");
CREATE INDEX IF NOT EXISTS "ProjectNotificationPreference_userId_idx"
  ON "ProjectNotificationPreference"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailDeliveryLog_dedupeKey_key"
  ON "EmailDeliveryLog"("dedupeKey");
CREATE INDEX IF NOT EXISTS "EmailDeliveryLog_userId_sentAt_idx"
  ON "EmailDeliveryLog"("userId", "sentAt");
CREATE INDEX IF NOT EXISTS "EmailDeliveryLog_projectId_idx"
  ON "EmailDeliveryLog"("projectId");

-- AddForeignKey (guarded — only ProjectNotificationPreference cascades; the
-- ledger is intentionally relation-free so its rows survive deletes for audit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectNotificationPreference_projectId_fkey') THEN
    ALTER TABLE "ProjectNotificationPreference"
      ADD CONSTRAINT "ProjectNotificationPreference_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectNotificationPreference_userId_fkey') THEN
    ALTER TABLE "ProjectNotificationPreference"
      ADD CONSTRAINT "ProjectNotificationPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
