-- Phase 9B — Global Search: tsvector GIN indexes
-- Adds stored tsvector columns to Story, Epic, Project, Comment.
-- Maintained by BEFORE INSERT OR UPDATE triggers.
-- schema.prisma does NOT declare these columns — queried only via $queryRaw.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Add search_vector columns
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "Story"   ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE "Epic"    ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS search_vector tsvector;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. GIN indexes for fast full-text queries
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS story_search_gin_idx   ON "Story"   USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS epic_search_gin_idx    ON "Epic"    USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS project_search_gin_idx ON "Project" USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS comment_search_gin_idx ON "Comment" USING GIN(search_vector);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Trigger functions — keep search_vector in sync on every write
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION story_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.key, '') || ' ' ||
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS story_search_trigger ON "Story";
CREATE TRIGGER story_search_trigger
  BEFORE INSERT OR UPDATE ON "Story"
  FOR EACH ROW EXECUTE FUNCTION story_search_update();

CREATE OR REPLACE FUNCTION epic_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.key, '') || ' ' ||
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS epic_search_trigger ON "Epic";
CREATE TRIGGER epic_search_trigger
  BEFORE INSERT OR UPDATE ON "Epic"
  FOR EACH ROW EXECUTE FUNCTION epic_search_update();

CREATE OR REPLACE FUNCTION project_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.key, '') || ' ' ||
    coalesce(NEW.name, '') || ' ' ||
    coalesce(NEW.description, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_search_trigger ON "Project";
CREATE TRIGGER project_search_trigger
  BEFORE INSERT OR UPDATE ON "Project"
  FOR EACH ROW EXECUTE FUNCTION project_search_update();

CREATE OR REPLACE FUNCTION comment_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.body, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comment_search_trigger ON "Comment";
CREATE TRIGGER comment_search_trigger
  BEFORE INSERT OR UPDATE ON "Comment"
  FOR EACH ROW EXECUTE FUNCTION comment_search_update();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Backfill existing rows
-- ─────────────────────────────────────────────────────────────────────────
UPDATE "Story" SET search_vector = to_tsvector('english',
  coalesce(key, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '')
);

UPDATE "Epic" SET search_vector = to_tsvector('english',
  coalesce(key, '') || ' ' || coalesce(title, '') || ' ' || coalesce(description, '')
);

UPDATE "Project" SET search_vector = to_tsvector('english',
  coalesce(key, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, '')
);

UPDATE "Comment" SET search_vector = to_tsvector('english', coalesce(body, ''));

COMMIT;
