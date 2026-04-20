-- Player projection table: one row per (snapshot, player).
-- Written at every checkpoint alongside world_snapshots so callers can
-- query player state without deserialising the full JSONB snapshot blob.
CREATE TABLE IF NOT EXISTS player_projection (
  snapshot_id         BIGINT  NOT NULL REFERENCES world_snapshots(snapshot_id) ON DELETE CASCADE,
  player_id           TEXT    NOT NULL,
  name                TEXT,
  points              INTEGER NOT NULL DEFAULT 0,
  manpower            INTEGER NOT NULL DEFAULT 0,
  manpower_cap        INTEGER,
  tech_ids            JSONB   NOT NULL DEFAULT '[]',
  domain_ids          JSONB   NOT NULL DEFAULT '[]',
  strategic_resources JSONB   NOT NULL DEFAULT '{}',
  allies              JSONB   NOT NULL DEFAULT '[]',
  territory_tile_count INTEGER NOT NULL DEFAULT 0,
  settled_tile_count  INTEGER,
  town_count          INTEGER,
  income_per_minute   REAL,
  PRIMARY KEY (snapshot_id, player_id)
);

CREATE INDEX IF NOT EXISTS player_projection_player_idx
  ON player_projection (player_id, snapshot_id DESC);
