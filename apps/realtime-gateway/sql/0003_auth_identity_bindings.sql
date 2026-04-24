CREATE TABLE IF NOT EXISTS auth_identity_bindings (
  auth_uid TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  auth_email TEXT,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_identity_bindings_player_id_idx ON auth_identity_bindings (player_id);
