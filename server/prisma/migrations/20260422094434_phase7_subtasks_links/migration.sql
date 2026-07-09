-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('blocks', 'blocked_by', 'duplicates', 'duplicated_by', 'relates_to');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEvent" ADD VALUE 'subtask_added';
ALTER TYPE "ActivityEvent" ADD VALUE 'linked';
ALTER TYPE "ActivityEvent" ADD VALUE 'unlinked';

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "parentStoryId" TEXT;

-- CreateTable
CREATE TABLE "StoryLink" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "LinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryLink_sourceId_idx" ON "StoryLink"("sourceId");

-- CreateIndex
CREATE INDEX "StoryLink_targetId_idx" ON "StoryLink"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryLink_sourceId_targetId_type_key" ON "StoryLink"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "Story_parentStoryId_idx" ON "Story"("parentStoryId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_parentStoryId_fkey" FOREIGN KEY ("parentStoryId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLink" ADD CONSTRAINT "StoryLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryLink" ADD CONSTRAINT "StoryLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
