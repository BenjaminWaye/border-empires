import { DatabaseSync } from "node:sqlite";
import { GATEWAY_SQLITE_BUSY_TIMEOUT_MS } from "./sqlite-busy-retry.js";

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

// Schema setup runs before the gateway accepts traffic and can wait for the
// simulation's DB lock. Runtime queries cannot: DatabaseSync blocks the
// gateway's event loop, so switch to brief waits plus async retries at boot.
export const setRuntimeSqliteBusyTimeout = (): void => {
  sharedDb?.exec(`PRAGMA busy_timeout = ${GATEWAY_SQLITE_BUSY_TIMEOUT_MS};`);
};
