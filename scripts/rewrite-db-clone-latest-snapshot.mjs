#!/usr/bin/env node
import { readFile } from "node:fs/promises";

import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const sourceConnectionString = process.env.SOURCE_DATABASE_URL;
const targetConnectionString = process.env.TARGET_DATABASE_URL ?? process.env.DATABASE_URL;

if (!sourceConnectionString || !targetConnectionString) {
  console.error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL (or DATABASE_URL) are required");
  process.exit(1);
}
if (sourceConnectionString === targetConnectionString) {
  console.error("Refusing to clone latest snapshot into the same database URL");
  process.exit(1);
}

const sqlFile = async (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const applySchemas = async (pool) => {
  const schemaFiles = [
    "apps/realtime-gateway/sql/0001_command_store.sql",
    "apps/realtime-gateway/sql/0002_player_profiles.sql",
    "apps/realtime-gateway/sql/0003_auth_identity_bindings.sql",
    "apps/realtime-gateway/sql/0004_rally_links.sql",
    "apps/simulation/sql/0001_world_events.sql",
    "apps/simulation/sql/0002_command_store.sql",
    "apps/simulation/sql/0003_world_snapshots.sql",
    "apps/simulation/sql/0004_player_projection.sql",
    "apps/simulation/sql/0005_tile_projection.sql",
    "apps/simulation/sql/0006_combat_lock_projection.sql",
    "apps/simulation/sql/0007_visibility_projection.sql",
    "apps/simulation/sql/0008_bounded_storage.sql",
    "apps/simulation/sql/0009_season_lifecycle.sql"
  ];
  for (const file of schemaFiles) {
    await pool.query(await sqlFile(file));
  }
};

const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

const truncateExistingTables = async (pool) => {
  const tables = [
    "command_results",
    "commands",
    "world_events",
    "world_snapshots",
    "checkpoint_metadata",
    "season_archive",
    "world_status_current",
    "player_projection_current",
    "tile_projection_current",
    "combat_lock_projection_current",
    "visibility_projection_current",
    "player_profiles",
    "auth_identity_bindings",
    "rally_links"
  ];
  const existing = await pool.query(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    `,
    [tables]
  );
  const names = existing.rows.map((row) => row.table_name).filter((name) => typeof name === "string");
  if (names.length === 0) return;
  await pool.query(`TRUNCATE TABLE ${names.map(quoteIdent).join(", ")} RESTART IDENTITY CASCADE`);
};

const loadLatestSnapshot = async (pool) => {
  const result = await pool.query(`
    WITH pointed AS (
      SELECT current_snapshot_id
      FROM checkpoint_metadata
      WHERE season_id = 'active'
      LIMIT 1
    )
    SELECT snapshot_id, last_applied_event_id, snapshot_payload, created_at
    FROM world_snapshots
    WHERE snapshot_id = COALESCE((SELECT current_snapshot_id FROM pointed), snapshot_id)
    ORDER BY snapshot_id DESC
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) throw new Error("source database has no world_snapshots row");
  return row;
};

const seedCheckpoint = async (pool, snapshotId, lastAppliedEventId, createdAt) => {
  await pool.query(
    `
    INSERT INTO checkpoint_metadata (
      season_id,
      current_snapshot_id,
      last_applied_event_id,
      last_compacted_event_id,
      checkpointed_at,
      updated_at
    )
    VALUES ($1, $2, $3, $3, $4, $4)
    ON CONFLICT (season_id) DO UPDATE
    SET current_snapshot_id = EXCLUDED.current_snapshot_id,
        last_applied_event_id = EXCLUDED.last_applied_event_id,
        last_compacted_event_id = EXCLUDED.last_compacted_event_id,
        checkpointed_at = EXCLUDED.checkpointed_at,
        updated_at = EXCLUDED.updated_at
    `,
    ["active", snapshotId, lastAppliedEventId, createdAt]
  );
};

const source = new pg.Pool({ connectionString: sourceConnectionString });
const target = new pg.Pool({ connectionString: targetConnectionString });

try {
  const latest = await loadLatestSnapshot(source);
  await applySchemas(target);
  await truncateExistingTables(target);

  const insert = await target.query(
    `
    INSERT INTO world_snapshots (last_applied_event_id, snapshot_payload, created_at)
    VALUES ($1, $2::jsonb, $3)
    RETURNING snapshot_id
    `,
    [latest.last_applied_event_id, JSON.stringify(latest.snapshot_payload), latest.created_at]
  );
  const targetSnapshotId = Number(insert.rows[0]?.snapshot_id ?? 0);
  if (targetSnapshotId <= 0) throw new Error("target snapshot insert did not return a snapshot id");
  await seedCheckpoint(target, targetSnapshotId, Number(latest.last_applied_event_id), Number(latest.created_at));

  const tileCount = Array.isArray(latest.snapshot_payload?.initialState?.tiles)
    ? latest.snapshot_payload.initialState.tiles.length
    : null;
  const playerCount = Array.isArray(latest.snapshot_payload?.initialState?.players)
    ? latest.snapshot_payload.initialState.players.length
    : null;
  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceSnapshotId: Number(latest.snapshot_id),
        targetSnapshotId,
        lastAppliedEventId: Number(latest.last_applied_event_id),
        createdAt: Number(latest.created_at),
        tileCount,
        playerCount
      },
      null,
      2
    )
  );
} finally {
  await Promise.allSettled([source.end(), target.end()]);
}
