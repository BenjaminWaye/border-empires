import { DatabaseSync } from "node:sqlite";

export type SqliteDatabase = DatabaseSync;

let sharedDb: DatabaseSync | undefined;
let sharedDbPath: string | undefined;

export const openSqliteDatabase = (path: string): DatabaseSync => {
  if (sharedDb && sharedDbPath === path) return sharedDb;
  if (sharedDb && sharedDbPath !== path) {
    sharedDb.close();
    sharedDb = undefined;
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  // Self-heal corrupt indexes on boot. A hard SIGKILL (watchdog/OOM) landing on
  // a WAL checkpoint under synchronous=NORMAL can leave a secondary index with
  // missing entries (SQLITE_CORRUPT_INDEX). That makes the snapshot prune DELETE
  // throw and wedges the checkpoint loop. REINDEX rebuilds indexes from the
  // intact table data with no data loss. This runs once at sim-worker boot,
  // before the gateway connection opens, so it holds a single writer. Disable
  // with SIMULATION_DB_REINDEX_ON_CORRUPTION=0.
  if (process.env.SIMULATION_DB_REINDEX_ON_CORRUPTION !== "0") {
    const rows = db.prepare("PRAGMA quick_check").all() as Array<{ quick_check?: string }>;
    const healthy = rows.length === 1 && rows[0]?.quick_check === "ok";
    if (!healthy) {
      const t0 = Date.now();
      const issues = rows.map((row) => row.quick_check).filter(Boolean).slice(0, 5);
      // eslint-disable-next-line no-console
      console.log(`[sqlite] quick_check found corruption (${issues.join("; ")}); running REINDEX`);
      db.exec("REINDEX");
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      // eslint-disable-next-line no-console
      console.log(`[sqlite] REINDEX complete in ${Date.now() - t0}ms`);
    }
  }
  if (process.env.SIMULATION_DB_VACUUM_ON_START === "1") {
    const t0 = Date.now();
    db.exec("VACUUM");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    // eslint-disable-next-line no-console
    console.log(`[sqlite] VACUUM complete in ${Date.now() - t0}ms`);
  }
  sharedDb = db;
  sharedDbPath = path;
  return db;
};

export const closeSqliteDatabase = (): void => {
  if (sharedDb) {
    sharedDb.close();
    sharedDb = undefined;
    sharedDbPath = undefined;
  }
};
