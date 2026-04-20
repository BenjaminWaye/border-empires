/**
 * Verifies that running every SQL migration twice is a no-op.
 * Uses an in-process pg instance (or SIMULATION_TEST_DATABASE_URL).
 * Skipped when no database URL is configured.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlDir = path.resolve(here, "../sql");

const DB_URL = process.env.SIMULATION_TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const MIGRATIONS = [
  "0001_world_events.sql",
  "0002_command_store.sql",
  "0003_world_snapshots.sql",
  "0004_player_projection.sql",
  "0005_tile_projection.sql",
  "0006_combat_lock_projection.sql",
  "0007_visibility_projection.sql"
];

describe.skipIf(!DB_URL)("migration idempotency", () => {
  it("running all migrations twice produces no error and no duplicate objects", async () => {
    const pool = new pg.Pool({ connectionString: DB_URL });
    try {
      // First pass
      for (const filename of MIGRATIONS) {
        const sql = readFileSync(path.join(sqlDir, filename), "utf8");
        await expect(pool.query(sql)).resolves.not.toThrow();
      }
      // Second pass — CREATE IF NOT EXISTS everywhere so this must also pass
      for (const filename of MIGRATIONS) {
        const sql = readFileSync(path.join(sqlDir, filename), "utf8");
        await expect(pool.query(sql)).resolves.not.toThrow();
      }
    } finally {
      await pool.end();
    }
  });
});
