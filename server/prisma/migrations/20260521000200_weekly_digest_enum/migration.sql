-- AlterEnum
-- Weekly digest notification type. Own migration: Postgres forbids using a
-- freshly-added enum value in the same transaction that added it.
ALTER TYPE "NotificationType" ADD VALUE 'weekly_digest';
