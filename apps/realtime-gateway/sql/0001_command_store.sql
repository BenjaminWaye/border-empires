CREATE TABLE IF NOT EXISTS commands (
  command_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  client_seq BIGINT NOT NULL,
  command_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  queued_at BIGINT NOT NULL
);

ALTER TABLE commands
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS player_id TEXT,
  ADD COLUMN IF NOT EXISTS client_seq BIGINT,
  ADD COLUMN IF NOT EXISTS command_type TEXT,
  ADD COLUMN IF NOT EXISTS payload_json JSONB,
  ADD COLUMN IF NOT EXISTS queued_at BIGINT;

ALTER TABLE commands
  ALTER COLUMN command_type TYPE TEXT USING command_type::text,
  ALTER COLUMN client_seq TYPE BIGINT USING client_seq::bigint;

UPDATE commands
SET queued_at = 0
WHERE queued_at IS NULL;

WITH ranked_commands AS (
  SELECT
    command_id,
    ROW_NUMBER() OVER (
      PARTITION BY player_id
      ORDER BY queued_at ASC, command_id ASC
    ) AS next_client_seq
  FROM commands
  WHERE client_seq IS NULL
)
UPDATE commands AS c
SET client_seq = ranked_commands.next_client_seq
FROM ranked_commands
WHERE c.command_id = ranked_commands.command_id;

ALTER TABLE commands
  ALTER COLUMN session_id SET NOT NULL,
  ALTER COLUMN player_id SET NOT NULL,
  ALTER COLUMN client_seq SET NOT NULL,
  ALTER COLUMN command_type SET NOT NULL,
  ALTER COLUMN payload_json SET NOT NULL,
  ALTER COLUMN queued_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commands_player_seq_idx ON commands (player_id, client_seq);

CREATE TABLE IF NOT EXISTS command_results (
  command_id TEXT PRIMARY KEY REFERENCES commands (command_id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  accepted_at BIGINT,
  rejected_at BIGINT,
  rejected_code TEXT,
  rejected_message TEXT,
  resolved_at BIGINT
);

ALTER TABLE command_results
  ADD COLUMN IF NOT EXISTS accepted_at BIGINT,
  ADD COLUMN IF NOT EXISTS rejected_at BIGINT,
  ADD COLUMN IF NOT EXISTS rejected_code TEXT,
  ADD COLUMN IF NOT EXISTS rejected_message TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at BIGINT;
