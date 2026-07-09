-- Phase 2: a new notification type for cross-org "join my org" invitations.
-- Pure additive enum value — no table touched, no data rewritten. On PostgreSQL
-- 12+ this runs safely (we only ADD the value here, never use it in the same
-- migration), and it's isolated in its own migration file so the ALTER TYPE
-- never shares a transaction with other DDL.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'org_invite';
