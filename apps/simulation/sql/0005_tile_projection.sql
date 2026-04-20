-- Tile projection table: one row per (snapshot, tile).
-- Enables fast ownership and structure queries without JSONB deserialization.
CREATE TABLE IF NOT EXISTS tile_projection (
  snapshot_id        BIGINT  NOT NULL REFERENCES world_snapshots(snapshot_id) ON DELETE CASCADE,
  tile_key           TEXT    NOT NULL,
  x                  INTEGER NOT NULL,
  y                  INTEGER NOT NULL,
  terrain            TEXT    NOT NULL,
  resource           TEXT,
  dock_id            TEXT,
  owner_id           TEXT,
  ownership_state    TEXT,
  town               JSONB,
  fort               JSONB,
  observatory        JSONB,
  siege_outpost      JSONB,
  economic_structure JSONB,
  sabotage           JSONB,
  shard_site         JSONB,
  PRIMARY KEY (snapshot_id, tile_key)
);

CREATE INDEX IF NOT EXISTS tile_projection_owner_idx
  ON tile_projection (snapshot_id, owner_id)
  WHERE owner_id IS NOT NULL;
