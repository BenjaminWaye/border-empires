-- Combat lock projection table: active frontier locks at the time of each snapshot.
-- One row per (snapshot, command) — used for restart-parity assertions and
-- admin visibility into in-flight battles.
CREATE TABLE IF NOT EXISTS combat_lock_projection (
  snapshot_id  BIGINT NOT NULL REFERENCES world_snapshots(snapshot_id) ON DELETE CASCADE,
  command_id   TEXT   NOT NULL,
  player_id    TEXT   NOT NULL,
  origin_key   TEXT   NOT NULL,
  target_key   TEXT   NOT NULL,
  resolves_at  BIGINT NOT NULL,
  PRIMARY KEY (snapshot_id, command_id)
);

CREATE INDEX IF NOT EXISTS combat_lock_projection_player_idx
  ON combat_lock_projection (player_id, snapshot_id DESC);
