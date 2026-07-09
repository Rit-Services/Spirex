-- Phase 13: organization branding (logo + website URL). Additive and nullable —
-- safe to apply on a running cluster, nothing reads these until the new code ships.
ALTER TABLE "Organization" ADD COLUMN "logoPath" TEXT;
ALTER TABLE "Organization" ADD COLUMN "url" TEXT;
