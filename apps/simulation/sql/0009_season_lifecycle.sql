CREATE TABLE IF NOT EXISTS world_status_current (
  singleton_key   TEXT PRIMARY KEY,
  season_id       TEXT NOT NULL,
  season_sequence INTEGER NOT NULL DEFAULT 1,
  summary_json    JSONB NOT NULL,
  updated_at      BIGINT NOT NULL
);

ALTER TABLE season_archive
  ADD COLUMN IF NOT EXISTS season_sequence INTEGER,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT;

UPDATE season_archive
SET season_sequence = COALESCE(season_sequence, 1),
    updated_at = COALESCE(updated_at, created_at)
WHERE season_sequence IS NULL
   OR updated_at IS NULL;

ALTER TABLE season_archive
  ALTER COLUMN season_sequence SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS season_archive_sequence_idx
  ON season_archive (season_sequence DESC);
