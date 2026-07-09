-- Drop the dormant voice-import and voice-agent (ElevenLabs) models.
--
-- Neither feature ships in this edition: the voice-import pipeline and the
-- conversational voice→ticket agent were removed, leaving their tables, the
-- Story back-reference column, and their enums orphaned. This migration removes
-- them. All statements are guarded with IF EXISTS so applying to a database that
-- never had these objects (or a partially-migrated one) is a safe no-op.

-- 1. Story loses its nullable FK column to VoiceImport. Dropping the column also
--    drops the "Story_sourceVoiceImportId_fkey" constraint and its index. The
--    column was provenance-only (SetNull on delete), so no story rows are lost.
ALTER TABLE "Story" DROP COLUMN IF EXISTS "sourceVoiceImportId";

-- 2. Drop the tables. Dropping "VoiceImport" also removes its FKs to
--    Project / User / Attachment (including the unique attachment link).
DROP TABLE IF EXISTS "VoiceAgentSession";
DROP TABLE IF EXISTS "VoiceImport";

-- 3. Drop the now-unreferenced enum types.
DROP TYPE IF EXISTS "VoiceAgentSessionStatus";
DROP TYPE IF EXISTS "VoiceImportStatus";

-- NOTE: the "ActivityEvent" enum values 'voice_imported' and 'voice_agent_created'
-- are intentionally LEFT in place. PostgreSQL cannot drop a value from an enum
-- without recreating the whole type (rename + recreate + rewrite every column +
-- drop old), which is disproportionate for two inert values that no code emits.
