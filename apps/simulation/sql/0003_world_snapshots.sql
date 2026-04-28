CREATE TABLE IF NOT EXISTS world_snapshots (
  snapshot_id BIGSERIAL PRIMARY KEY,
  last_applied_event_id BIGINT NOT NULL,
  snapshot_payload JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS world_snapshots_created_idx
  ON world_snapshots (created_at DESC);
