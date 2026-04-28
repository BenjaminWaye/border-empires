CREATE TABLE IF NOT EXISTS world_events (
  event_id BIGSERIAL PRIMARY KEY,
  command_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS world_events_command_idx ON world_events (command_id, event_id);
CREATE INDEX IF NOT EXISTS world_events_player_idx ON world_events (player_id, event_id);
