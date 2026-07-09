/*
  Warnings:

  - You are about to drop the column `search_vector` on the `Comment` table. All the data in the column will be lost.
  - You are about to drop the column `search_vector` on the `Epic` table. All the data in the column will be lost.
  - You are about to drop the column `search_vector` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `search_vector` on the `Story` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('story_assigned', 'story_commented', 'story_status_changed', 'story_reporter_changed');

-- AlterEnum
ALTER TYPE "ActivityEvent" ADD VALUE 'reporter_changed';

-- Drop triggers that maintained the search_vector columns (must come before column drops)
DROP TRIGGER IF EXISTS project_search_trigger ON "Project";
DROP TRIGGER IF EXISTS story_search_trigger   ON "Story";
DROP TRIGGER IF EXISTS epic_search_trigger    ON "Epic";
DROP TRIGGER IF EXISTS comment_search_trigger ON "Comment";
DROP FUNCTION IF EXISTS project_search_update();
DROP FUNCTION IF EXISTS story_search_update();
DROP FUNCTION IF EXISTS epic_search_update();
DROP FUNCTION IF EXISTS comment_search_update();

-- DropIndex
DROP INDEX "comment_search_gin_idx";

-- DropIndex
DROP INDEX "epic_search_gin_idx";

-- DropIndex
DROP INDEX "project_search_gin_idx";

-- DropIndex
DROP INDEX "Story_projectId_statusId_idx";

-- DropIndex
DROP INDEX "Story_sourceDocumentId_idx";

-- DropIndex
DROP INDEX "story_search_gin_idx";

-- AlterTable
ALTER TABLE "Comment" DROP COLUMN "search_vector";

-- AlterTable
ALTER TABLE "Epic" DROP COLUMN "search_vector";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "search_vector";

-- AlterTable
ALTER TABLE "Story" DROP COLUMN "search_vector";

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "storyId" TEXT,
    "storyKey" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_storyId_idx" ON "Notification"("storyId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
