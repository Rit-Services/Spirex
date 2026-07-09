-- CreateEnum
CREATE TYPE "EpicStatus" AS ENUM ('open', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('story', 'bug', 'task');

-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'qa', 'done');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ActivityEvent" AS ENUM ('created', 'status_changed', 'assigned', 'sprint_moved', 'epic_changed', 'commented', 'worklogged');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "nextEpicNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextStoryNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Epic" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0052CC',
    "status" "EpicStatus" NOT NULL DEFAULT 'open',
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Epic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "acceptanceCriteria" TEXT,
    "type" "StoryType" NOT NULL DEFAULT 'story',
    "status" "StoryStatus" NOT NULL DEFAULT 'backlog',
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "storyPoints" INTEGER,
    "originalEstimateMinutes" INTEGER,
    "epicId" TEXT,
    "sprintId" TEXT,
    "assigneeId" TEXT,
    "reporterId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "event" "ActivityEvent" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Epic_key_key" ON "Epic"("key");

-- CreateIndex
CREATE INDEX "Epic_projectId_idx" ON "Epic"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Story_key_key" ON "Story"("key");

-- CreateIndex
CREATE INDEX "Story_projectId_status_idx" ON "Story"("projectId", "status");

-- CreateIndex
CREATE INDEX "Story_projectId_sprintId_idx" ON "Story"("projectId", "sprintId");

-- CreateIndex
CREATE INDEX "Story_projectId_epicId_idx" ON "Story"("projectId", "epicId");

-- CreateIndex
CREATE INDEX "ActivityLog_storyId_createdAt_idx" ON "ActivityLog"("storyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Epic" ADD CONSTRAINT "Epic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_epicId_fkey" FOREIGN KEY ("epicId") REFERENCES "Epic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
