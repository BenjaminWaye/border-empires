import { readFile } from "node:fs/promises";

import pg from "../apps/simulation/node_modules/pg/esm/index.mjs";

const connectionString = process.env.DATABASE_URL;
const migrationTarget = process.env.REWRITE_MIGRATION_TARGET;

if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const MIGRATIONS = [
  "apps/realtime-gateway/sql/0001_command_store.sql",
  "apps/simulation/sql/0001_world_events.sql",
  "apps/simulation/sql/0002_command_store.sql",
  "apps/simulation/sql/0003_world_snapshots.sql",
  "apps/simulation/sql/0004_player_projection.sql",
  "apps/simulation/sql/0005_tile_projection.sql",
  "apps/simulation/sql/0006_combat_lock_projection.sql",
  "apps/simulation/sql/0007_visibility_projection.sql",
  "apps/simulation/sql/0008_bounded_storage.sql"
];

const selectedMigrations = (() => {
  if (!migrationTarget) return MIGRATIONS;
  const targetIndex = MIGRATIONS.findIndex((path) => path.endsWith(`/${migrationTarget}`) || path === migrationTarget);
  if (targetIndex < 0) {
    console.error(`Unknown REWRITE_MIGRATION_TARGET: ${migrationTarget}`);
    process.exit(1);
  }
  return MIGRATIONS.slice(0, targetIndex + 1);
})();

const loadMigrationSql = async (relativePath) =>
  await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const pool = new pg.Pool({ connectionString });

try {
  for (const migration of selectedMigrations) {
    const sql = await loadMigrationSql(migration);
    await pool.query(sql);
    console.log(`applied ${migration}`);
  }
  console.log(
    JSON.stringify({
      ok: true,
      appliedCount: selectedMigrations.length,
      target: migrationTarget ?? "latest"
    })
  );
} finally {
  await pool.end();
}
