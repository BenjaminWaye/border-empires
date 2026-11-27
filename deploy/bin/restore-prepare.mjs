// Decompresses a backup made by deploy/bin/backup and proves it is usable:
// full PRAGMA integrity_check, foreign_key_check, and a short summary of what
// the copy holds. Writes nothing but <out.db>. Imports only node: built-ins, so
// deploy/bin/restore-backup can pipe it into `node` inside the app container,
// and it runs the same on a laptop: node deploy/bin/restore-prepare.mjs <in.db.zst> <out.db>
//
// Prints one JSON line; exits 1 (and removes <out.db>) if the copy is not sound.
import { DatabaseSync } from "node:sqlite";
import { createReadStream, createWriteStream, existsSync, rmSync, statSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createZstdDecompress } from "node:zlib";

/** Decompresses `inPath` to `outPath` and checks it. Exported for the regression test. */
export const prepareRestore = async (inPath, outPath) => {
  if (existsSync(outPath)) throw new Error(`${outPath} already exists; refusing to overwrite`);
  try {
    await pipeline(createReadStream(inPath), createZstdDecompress(), createWriteStream(outPath, { flags: "wx" }));
    const db = new DatabaseSync(outPath, { readOnly: true });
    try {
      const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => Object.values(row)[0]);
      if (integrity.length !== 1 || integrity[0] !== "ok") {
        throw new Error(`integrity_check failed: ${integrity.slice(0, 5).join("; ")}`);
      }
      const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all().length;
      if (foreignKeyErrors > 0) throw new Error(`foreign_key_check found ${foreignKeyErrors} broken references`);
      const tables = db
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((row) => row.name);
      const has = (name) => tables.includes(name);
      const latestSnapshot = has("world_snapshots")
        ? db.prepare("SELECT max(snapshot_id) AS id, max(last_applied_event_id) AS event FROM world_snapshots").get()
        : undefined;
      const latestEvent = has("world_events") ? db.prepare("SELECT max(event_id) AS id FROM world_events").get() : undefined;
      return {
        ok: true,
        out: outPath,
        bytes: statSync(outPath).size,
        tables: tables.length,
        latestSnapshotId: latestSnapshot?.id ?? null,
        latestSnapshotEventId: latestSnapshot?.event ?? null,
        latestEventId: latestEvent?.id ?? null
      };
    } finally {
      db.close();
    }
  } catch (error) {
    rmSync(outPath, { force: true });
    throw error;
  }
};

if (process.argv[1] === undefined || process.argv[1] === "-" || import.meta.url === `file://${process.argv[1]}`) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath || !outPath) {
    console.error("usage: restore-prepare.mjs <in.db.zst> <out.db>");
    process.exit(2);
  }
  prepareRestore(inPath, outPath).then(
    (result) => console.log(JSON.stringify(result)),
    (error) => {
      console.error(`restore-prepare failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  );
}
