CREATE TABLE IF NOT EXISTS rally_links (
  code TEXT PRIMARY KEY,
  owner_player_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  note TEXT,
  anchor_x INTEGER NOT NULL,
  anchor_y INTEGER NOT NULL,
  anchor_island TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked_at BIGINT
);

CREATE INDEX IF NOT EXISTS rally_links_owner_active_idx
  ON rally_links (owner_player_id, expires_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS rally_links_owner_created_idx
  ON rally_links (owner_player_id, created_at DESC);
