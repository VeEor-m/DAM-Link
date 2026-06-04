-- Enable trigram search on asset name, uploader, and tags.
-- The pg_trgm extension is created in packages/api/drizzle/init.sql
-- which runs on first container start.

CREATE INDEX IF NOT EXISTS assets_name_trgm
  ON assets USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS assets_uploaded_by_trgm
  ON assets USING GIN ((uploaded_by::text) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS assets_tags_gin
  ON assets USING GIN (tags);
