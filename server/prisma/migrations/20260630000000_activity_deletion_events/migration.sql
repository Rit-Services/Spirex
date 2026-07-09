-- Log deletions in the story activity feed. Adds ActivityEvent variants for the
-- three story-attached resources that can be deleted from the detail view:
-- worklogs, attachments, and comments.
--
-- IF NOT EXISTS keeps this a NO-OP on databases where the values were already
-- introduced via `db push` (local dev), and a clean apply on migrate-deploy-only
-- environments (fresh + prod). Postgres allows ADD VALUE inside a transaction
-- on the versions we target.
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'worklog_deleted';
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'attachment_deleted';
ALTER TYPE "ActivityEvent" ADD VALUE IF NOT EXISTS 'comment_deleted';
