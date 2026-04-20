-- Visibility projection table: per-player visible tile set at each snapshot.
-- Stored as a compact JSONB array of "x,y" keys so gateway can answer
-- "what can this player see?" without spinning up a full sim recovery.
CREATE TABLE IF NOT EXISTS visibility_projection (
  snapshot_id       BIGINT NOT NULL REFERENCES world_snapshots(snapshot_id) ON DELETE CASCADE,
  player_id         TEXT   NOT NULL,
  visible_tile_keys JSONB  NOT NULL DEFAULT '[]',
  PRIMARY KEY (snapshot_id, player_id)
);

CREATE INDEX IF NOT EXISTS visibility_projection_player_idx
  ON visibility_projection (player_id, snapshot_id DESC);
