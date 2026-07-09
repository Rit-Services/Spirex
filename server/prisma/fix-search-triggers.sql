-- Drop the stale search triggers whose target columns were removed by the notification migration.
DROP TRIGGER IF EXISTS project_search_trigger ON "Project";
DROP TRIGGER IF EXISTS story_search_trigger   ON "Story";
DROP TRIGGER IF EXISTS epic_search_trigger    ON "Epic";
DROP TRIGGER IF EXISTS comment_search_trigger ON "Comment";
DROP FUNCTION IF EXISTS project_search_update();
DROP FUNCTION IF EXISTS story_search_update();
DROP FUNCTION IF EXISTS epic_search_update();
DROP FUNCTION IF EXISTS comment_search_update();
