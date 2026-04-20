/**
 * One-shot importer: reads a legacy snapshot directory and writes it as the
 * initial world_snapshots row plus all projection tables in Postgres.
 *
 * Usage:
 *   DATABASE_URL=postgres://... \
 *     npx tsx scripts/rewrite-db-import-legacy-snapshot.ts /path/to/snapshot/dir
 *
 * The legacy snapshot directory must contain:
 *   state.meta.json, state.players.json, state.territory.json,
 *   state.economy.json, state.systems.json
 *
 * After this script completes, the simulation can boot DB-only (no snapshotDir).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

// Import simulation modules via relative paths (script runs from repo root)
import { loadLegacySnapshotBootstrap } from "../apps/simulation/src/legacy-snapshot-bootstrap.js";
import { buildSimulationSnapshotSections } from "../apps/simulation/src/snapshot-store.js";
import { recoverCommandHistory } from "../apps/simulation/src/command-recovery.js";
import { writeProjectionsForSnapshot } from "../apps/simulation/src/postgres-projection-writer.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

const snapshotDir = process.argv[2];
if (!snapshotDir) {
  console.error("ERROR: Usage: npx tsx scripts/rewrite-db-import-legacy-snapshot.ts <snapshot-dir>");
  process.exit(1);
}

const resolvedDir = path.resolve(snapshotDir);
console.log(`Loading legacy snapshot from: ${resolvedDir}`);

const MIGRATIONS = [
  "0001_world_events.sql",
  "0002_command_store.sql",
  "0003_world_snapshots.sql",
  "0004_player_projection.sql",
  "0005_tile_projection.sql",
  "0006_combat_lock_projection.sql",
  "0007_visibility_projection.sql"
];

const applyMigrations = async (pool: InstanceType<typeof pg.Pool>): Promise<void> => {
  for (const filename of MIGRATIONS) {
    const sqlPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../apps/simulation/sql",
      filename
    );
    const sql = readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log(`  ✓ ${filename}`);
  }
};

const main = async (): Promise<void> => {
  const pool = new pg.Pool({ connectionString });

  try {
    // 1. Apply schema (idempotent — all CREATE IF NOT EXISTS)
    console.log("Applying schema migrations...");
    await applyMigrations(pool);

    // 2. Check if a snapshot already exists
    const existingResult = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM world_snapshots"
    );
    const existingCount = parseInt(existingResult.rows[0]?.count ?? "0", 10);
    if (existingCount > 0) {
      console.log(`\nDB already has ${existingCount} snapshot(s). Aborting to avoid double-import.`);
      console.log("To force re-import, TRUNCATE world_snapshots CASCADE first.");
      process.exit(0);
    }

    // 3. Load and parse the legacy snapshot
    console.log("\nParsing legacy snapshot...");
    const bootstrap = loadLegacySnapshotBootstrap(resolvedDir);
    console.log(
      `  Loaded: season ${bootstrap.season?.seasonId ?? "unknown"}, ` +
      `${bootstrap.initialState.tiles.length} tiles, ` +
      `${bootstrap.playerProfiles.size} players`
    );

    // 4. Build snapshot sections (empty command history — this is a fresh import)
    const snapshotSections = buildSimulationSnapshotSections({
      initialState: bootstrap.initialState,
      commands: [],
      eventsByCommandId: new Map()
    });

    // 5. Insert world_snapshots row (event_id = 0 → no events applied yet)
    const insertResult = await pool.query<{ snapshot_id: number }>(
      `INSERT INTO world_snapshots (last_applied_event_id, snapshot_payload, created_at)
       VALUES (0, jsonb_build_object('initialState', $1::jsonb, 'commandEvents', $2::jsonb), $3)
       RETURNING snapshot_id`,
      [
        JSON.stringify(snapshotSections.initialState),
        JSON.stringify(snapshotSections.commandEvents),
        Date.now()
      ]
    );
    const snapshotId = insertResult.rows[0]?.snapshot_id;
    if (!snapshotId) throw new Error("snapshot insert did not return snapshot_id");
    console.log(`\n  ✓ Inserted world_snapshots row id=${snapshotId}`);

    // 6. Write projection tables from the bootstrap state
    console.log("Writing projection tables...");
    const exportedPlayers = [...bootstrap.playerProfiles.values()].map((profile) => ({
      id: profile.id,
      name: profile.name,
      points: profile.points,
      manpower: profile.manpower,
      techIds: profile.techIds ?? [],
      domainIds: profile.domainIds ?? [],
      strategicResources: (profile.strategicResources ?? {}) as Record<string, number>,
      allies: [],
      vision: 1,
      visionRadiusBonus: 0,
      territoryTileKeys: bootstrap.initialState.tiles
        .filter((t) => t.ownerId === profile.id)
        .map((t) => `${t.x},${t.y}`),
      settledTileCount: bootstrap.initialState.tiles.filter(
        (t) => t.ownerId === profile.id && t.ownershipState === "SETTLED"
      ).length,
      incomePerMinute: profile.incomePerMinute
    }));

    await writeProjectionsForSnapshot(
      pool,
      snapshotId,
      bootstrap.initialState,
      { players: exportedPlayers, activeLocks: bootstrap.initialState.activeLocks.map((l) => ({
        commandId: l.commandId,
        playerId: l.playerId,
        originKey: l.originKey,
        targetKey: l.targetKey,
        resolvesAt: l.resolvesAt
      })) }
    );
    console.log(`  ✓ player_projection  (${exportedPlayers.length} rows)`);
    console.log(`  ✓ tile_projection    (${bootstrap.initialState.tiles.length} rows)`);
    console.log(`  ✓ combat_lock_projection (${bootstrap.initialState.activeLocks.length} rows)`);
    console.log(`  ✓ visibility_projection  (${exportedPlayers.length} rows)`);

    console.log(`\nImport complete. Simulation can now boot from DB (snapshotId=${snapshotId}).`);
    console.log("Next: set DATABASE_URL on both staging apps and deploy.");
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
