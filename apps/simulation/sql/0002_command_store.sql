CREATE TABLE IF NOT EXISTS commands (
  command_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  client_seq INTEGER NOT NULL,
  command_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  queued_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS commands_player_seq_idx
  ON commands (player_id, client_seq);

CREATE TABLE IF NOT EXISTS command_results (
  command_id TEXT PRIMARY KEY REFERENCES commands(command_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  accepted_at BIGINT,
  rejected_at BIGINT,
  rejected_code TEXT,
  rejected_message TEXT,
  resolved_at BIGINT
);
