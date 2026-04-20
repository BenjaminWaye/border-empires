-- Bounded-storage schema additions for Supabase free-tier operation.
-- These tables are additive so rollout can switch runtime paths safely.

CREATE TABLE IF NOT EXISTS checkpoint_metadata (
  season_id               TEXT PRIMARY KEY,
  current_snapshot_id     BIGINT NOT NULL REFERENCES world_snapshots(snapshot_id) ON DELETE CASCADE,
  last_applied_event_id   BIGINT NOT NULL,
  last_compacted_event_id BIGINT NOT NULL,
  checkpointed_at         BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS season_archive (
  season_id          TEXT PRIMARY KEY,
  ended_at           BIGINT NOT NULL,
  summary_json       JSONB NOT NULL,
  replay_events_json JSONB NOT NULL,
  created_at         BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS season_archive_ended_at_idx
  ON season_archive (ended_at DESC);

-- Current-state projections (non-historical, bounded by world/player cardinality).
CREATE TABLE IF NOT EXISTS player_projection_current (
  player_id            TEXT PRIMARY KEY,
  name                 TEXT,
  points               INTEGER NOT NULL DEFAULT 0,
  manpower             INTEGER NOT NULL DEFAULT 0,
  manpower_cap         INTEGER,
  tech_ids             JSONB   NOT NULL DEFAULT '[]',
  domain_ids           JSONB   NOT NULL DEFAULT '[]',
  strategic_resources  JSONB   NOT NULL DEFAULT '{}',
  allies               JSONB   NOT NULL DEFAULT '[]',
  territory_tile_count INTEGER NOT NULL DEFAULT 0,
  settled_tile_count   INTEGER,
  town_count           INTEGER,
  income_per_minute    REAL,
  updated_at           BIGINT  NOT NULL
);

CREATE TABLE IF NOT EXISTS tile_projection_current (
  tile_key            TEXT PRIMARY KEY,
  x                   INTEGER NOT NULL,
  y                   INTEGER NOT NULL,
  terrain             TEXT    NOT NULL,
  resource            TEXT,
  dock_id             TEXT,
  owner_id            TEXT,
  ownership_state     TEXT,
  town                JSONB,
  fort                JSONB,
  observatory         JSONB,
  siege_outpost       JSONB,
  economic_structure  JSONB,
  sabotage            JSONB,
  shard_site          JSONB,
  updated_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS tile_projection_current_owner_idx
  ON tile_projection_current (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS combat_lock_projection_current (
  command_id  TEXT PRIMARY KEY,
  player_id   TEXT   NOT NULL,
  origin_key  TEXT   NOT NULL,
  target_key  TEXT   NOT NULL,
  resolves_at BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS combat_lock_projection_current_player_idx
  ON combat_lock_projection_current (player_id);

CREATE TABLE IF NOT EXISTS visibility_projection_current (
  player_id         TEXT PRIMARY KEY,
  visible_tile_keys JSONB  NOT NULL DEFAULT '[]',
  updated_at        BIGINT NOT NULL
);
