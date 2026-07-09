-- Project-scoped labels + the story↔label join.
--
-- Additive only and fully idempotent (every object is guarded), so a re-apply
-- on boot — the prod deploy model — is safe. Labels mirror epics as colored
-- badges but attach many-per-ticket through the StoryLabel join.

-- CreateTable
CREATE TABLE IF NOT EXISTS "Label" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#0052CC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoryLabel" (
    "storyId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    CONSTRAINT "StoryLabel_pkey" PRIMARY KEY ("storyId", "labelId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Label_projectId_name_key" ON "Label"("projectId", "name");
CREATE INDEX IF NOT EXISTS "Label_projectId_idx" ON "Label"("projectId");
CREATE INDEX IF NOT EXISTS "StoryLabel_labelId_idx" ON "StoryLabel"("labelId");

-- AddForeignKey (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Label_projectId_fkey') THEN
    ALTER TABLE "Label"
      ADD CONSTRAINT "Label_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoryLabel_storyId_fkey') THEN
    ALTER TABLE "StoryLabel"
      ADD CONSTRAINT "StoryLabel_storyId_fkey"
      FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoryLabel_labelId_fkey') THEN
    ALTER TABLE "StoryLabel"
      ADD CONSTRAINT "StoryLabel_labelId_fkey"
      FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
