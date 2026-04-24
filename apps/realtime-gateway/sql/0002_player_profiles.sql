CREATE TABLE IF NOT EXISTS player_profiles (
  player_id TEXT PRIMARY KEY,
  display_name TEXT,
  tile_color TEXT,
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS player_profiles_updated_at_idx ON player_profiles (updated_at DESC);
