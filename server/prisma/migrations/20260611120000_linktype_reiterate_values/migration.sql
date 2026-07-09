-- Drift repair: the `reiterates` / `reiterated_by` LinkType variants exist in
-- schema.prisma (and the re-iterate feature uses them) but were only ever
-- applied via `db push` — no migration covered them, so a database built
-- purely from the migration history is missing them and the feature would
-- fail at runtime there. Caught by the PR drift check on its first run.
--
-- IF NOT EXISTS makes this a NO-OP on db-push'ed databases (local dev) and a
-- repair on migrate-deploy-only databases (fresh environments, possibly prod).
ALTER TYPE "LinkType" ADD VALUE IF NOT EXISTS 'reiterates';
ALTER TYPE "LinkType" ADD VALUE IF NOT EXISTS 'reiterated_by';
