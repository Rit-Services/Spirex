-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email');

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryWatcher" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryWatcher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_type_channel_key" ON "NotificationPreference"("userId", "type", "channel");

-- CreateIndex
CREATE INDEX "StoryWatcher_userId_idx" ON "StoryWatcher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryWatcher_storyId_userId_key" ON "StoryWatcher"("storyId", "userId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryWatcher" ADD CONSTRAINT "StoryWatcher_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryWatcher" ADD CONSTRAINT "StoryWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing story's reporter and assignee become watchers, so
-- pre-existing stories notify their owners without waiting for a re-assign.
INSERT INTO "StoryWatcher" ("id", "storyId", "userId", "createdAt")
SELECT gen_random_uuid()::text, s."id", s."reporterId", CURRENT_TIMESTAMP
FROM "Story" s
ON CONFLICT ("storyId", "userId") DO NOTHING;

INSERT INTO "StoryWatcher" ("id", "storyId", "userId", "createdAt")
SELECT gen_random_uuid()::text, s."id", s."assigneeId", CURRENT_TIMESTAMP
FROM "Story" s
WHERE s."assigneeId" IS NOT NULL
ON CONFLICT ("storyId", "userId") DO NOTHING;
