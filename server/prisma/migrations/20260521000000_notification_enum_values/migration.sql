-- AlterEnum
-- New NotificationType values. Kept in their own migration: Postgres forbids
-- using a freshly-added enum value in the same transaction that added it.
ALTER TYPE "NotificationType" ADD VALUE 'story_priority_changed';
ALTER TYPE "NotificationType" ADD VALUE 'story_updated';
