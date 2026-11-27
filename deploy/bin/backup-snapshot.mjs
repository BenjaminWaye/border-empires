// Consistent, paced snapshot of the live SQLite database, compressed with zstd.
// deploy/bin/backup pipes this file into `node` inside the app container
// (`node --input-type=module - <db> <out.zst>`), so it may import only node:
// built-ins.
//
// Why paced: the old single `VACUUM INTO` read the whole ~1 GB database and
// wrote a 1 GB copy in one burst. On a 4 GB server that flooded the disk and the
// page cache, and the game's synchronous SQLite reads on the gateway thread then
// waited on disk: a 1.8-2.5 s gateway stall per snapshot in the local
// reproduction (docs/agents/deploys.md "Backups"). It was not lock contention:
// in WAL mode a reader never blocks the writers.
//
// How: one read transaction on the live database (so the copy is a consistent
// point in time, like VACUUM INTO), but the rows are copied into an attached
// scratch database a few MB at a time with a sleep after each chunk, holding
// the copy to --rate-mb MB/s. The scratch copy is then streamed through zstd at
// the same rate and deleted, so the disk never sees a burst. SQLite's online
// backup API is not used: in WAL mode it restarts whenever another connection
// writes, which the game does several times a second (measured: never finished).
//
// No quick_check of the copy by default: it re-reads the whole copy in one
// statement and was the one burst left (50 s, 4-9 s gateway stalls in the
// reproduction). The copy already reads every row of every table, so a corrupt
// table fails the snapshot; indexes are rebuilt fresh. The restore procedure
// runs a full integrity_check instead. --check turns it back on.
//
// Usage: backup-snapshot.mjs <db> <out.zst> [--rate-mb=16] [--chunk-mb=4] [--check]
// Prints one JSON line with timings on success; exits 1 on any failure and
// removes partial output.
import { DatabaseSync } from "node:sqlite";
import { createReadStream, createWriteStream, existsSync, rmSync, statSync } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { constants as zlibConstants, createZstdCompress } from "node:zlib";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quoteIdent = (name) => `"${String(name).replaceAll('"', '""')}"`;
const quoteString = (value) => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Copies `dbPath` into a fresh SQLite file at `outPath` from one read snapshot,
 * at most `rateBytesPerSec` of written pages per second. Returns timings.
 * Exported for the regression test; the CLI below wraps it.
 */
export const pacedSnapshot = async (dbPath, outPath, options = {}) => {
  const rateBytesPerSec = options.rateBytesPerSec ?? 16 * 1048576;
  const chunkBytes = options.chunkBytes ?? 4 * 1048576;
  const startedAt = performance.now();
  rmSync(outPath, { force: true });
  const db = new DatabaseSync(dbPath);
  let readTxnOpen = false;
  let maxStepMs = 0;
  let steps = 0;
  try {
    // Small page cache: this connection streams the whole file once and must not
    // hold hundreds of MB next to the game.
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA cache_size = -8000;");
    const pageSize = db.prepare("PRAGMA main.page_size").get().page_size;
    const autoVacuum = db.prepare("PRAGMA main.auto_vacuum").get().auto_vacuum;
    db.exec(`ATTACH ${quoteString(outPath)} AS bk`);
    db.exec(`PRAGMA bk.page_size = ${Number(pageSize)}; PRAGMA bk.auto_vacuum = ${Number(autoVacuum)};`);
    db.exec("PRAGMA bk.journal_mode = OFF; PRAGMA bk.synchronous = OFF;");
    const bkPages = db.prepare("PRAGMA bk.page_count");
    const written = () => Number(bkPages.get().page_count) * Number(pageSize);

    db.exec("BEGIN");
    readTxnOpen = true;
    // The first read pins the snapshot every later read in this transaction sees.
    const schema = db
      .prepare("SELECT type, name, tbl_name, sql FROM main.sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid")
      .all();
    const userVersion = db.prepare("PRAGMA main.user_version").get().user_version;
    const applicationId = db.prepare("PRAGMA main.application_id").get().application_id;
    // sqlite_schema stores "CREATE TABLE name ..." with the keywords normalized
    // and any schema qualifier removed, so prefixing the name retargets it.
    const retarget = (sql, keyword) => {
      const match = sql.match(new RegExp(`^(CREATE (?:UNIQUE )?${keyword} )`));
      if (!match) throw new Error(`unexpected schema SQL: ${sql.slice(0, 80)}`);
      return `${match[1]}bk.${sql.slice(match[1].length)}`;
    };
    const tables = schema.filter((row) => row.type === "table" && !String(row.name).startsWith("sqlite_"));
    for (const table of tables) db.exec(retarget(table.sql, "TABLE"));

    let budgetStartedAt = performance.now();
    let budgetStartBytes = written();
    const pace = async () => {
      // Sleep long enough that bytes written since the last reset stay under the rate.
      const bytes = written() - budgetStartBytes;
      const dueMs = (bytes / rateBytesPerSec) * 1000;
      const elapsedMs = performance.now() - budgetStartedAt;
      await sleep(Math.max(1, dueMs - elapsedMs));
      if (performance.now() - budgetStartedAt > 10_000) {
        budgetStartedAt = performance.now();
        budgetStartBytes = written();
      }
    };
    const step = (fn) => {
      const t0 = performance.now();
      const result = fn();
      maxStepMs = Math.max(maxStepMs, performance.now() - t0);
      steps += 1;
      return result;
    };

    for (const table of tables) {
      const name = quoteIdent(table.name);
      const columns = db
        .prepare(`PRAGMA main.table_xinfo(${quoteString(table.name)})`)
        .all()
        .filter((col) => Number(col.hidden) === 0)
        .map((col) => col.name);
      const columnList = columns.map(quoteIdent).join(", ");
      const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(table.sql);
      const rowidClash = columns.some((col) => ["rowid", "_rowid_", "oid"].includes(String(col).toLowerCase()));
      if (withoutRowid || rowidClash) {
        step(() => db.exec(`INSERT INTO bk.${name} (${columnList}) SELECT ${columnList} FROM main.${name}`));
        await pace();
        continue;
      }
      // Copy in rowid order, a few MB per statement; adapt the row count to the
      // row size so one statement stays near chunkBytes.
      const copy = db.prepare(
        `INSERT INTO bk.${name} (rowid, ${columnList}) SELECT rowid, ${columnList} FROM main.${name} WHERE rowid > ? ORDER BY rowid LIMIT ?`
      );
      const lastRowid = db.prepare(`SELECT max(rowid) AS r FROM bk.${name}`);
      let after = Number.MIN_SAFE_INTEGER;
      let rows = 64;
      for (;;) {
        const before = written();
        const changes = Number(step(() => copy.run(after, rows)).changes);
        if (!changes) break;
        after = lastRowid.get().r;
        const chunk = written() - before;
        if (chunk > chunkBytes && rows > 1) rows = Math.max(1, Math.floor(rows / 2));
        else if (chunk < chunkBytes / 4 && rows < 1 << 20) rows *= 2;
        await pace();
      }
    }
    // Internal tables that carry state: AUTOINCREMENT counters and ANALYZE stats.
    const internal = new Set(schema.map((row) => row.name));
    if (internal.has("sqlite_sequence")) {
      step(() => db.exec("DELETE FROM bk.sqlite_sequence; INSERT INTO bk.sqlite_sequence SELECT * FROM main.sqlite_sequence"));
    }
    if (internal.has("sqlite_stat1")) {
      step(() => db.exec("ANALYZE bk.sqlite_schema; DELETE FROM bk.sqlite_stat1; INSERT INTO bk.sqlite_stat1 SELECT * FROM main.sqlite_stat1"));
    }
    for (const row of schema) {
      if (row.type === "index") step(() => db.exec(retarget(row.sql, "INDEX")));
      else if (row.type === "view") step(() => db.exec(retarget(row.sql, "VIEW")));
      else if (row.type === "trigger") step(() => db.exec(retarget(row.sql, "(?:TEMP |TEMPORARY )?TRIGGER")));
      else continue;
      await pace();
    }
    db.exec(`PRAGMA bk.user_version = ${Number(userVersion)}; PRAGMA bk.application_id = ${Number(applicationId)};`);
    db.exec("COMMIT");
    readTxnOpen = false;
    const readTxnMs = performance.now() - startedAt;

    let checkMs = 0;
    if (options.check === true) {
      const t0 = performance.now();
      const rows = db.prepare("PRAGMA bk.quick_check").all();
      checkMs = performance.now() - t0;
      if (rows.length !== 1 || Object.values(rows[0])[0] !== "ok") {
        throw new Error(`quick_check failed on the copy: ${JSON.stringify(rows.slice(0, 3))}`);
      }
    }
    db.exec("DETACH bk");
    return { readTxnMs: Math.round(readTxnMs), checkMs: Math.round(checkMs), maxStepMs: Math.round(maxStepMs), steps, bytes: statSync(outPath).size };
  } catch (error) {
    if (readTxnOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // the transaction may already be gone
      }
    }
    rmSync(outPath, { force: true });
    throw error;
  } finally {
    db.close();
  }
};

/** Streams `inPath` through zstd into `outPath` at most `rateBytesPerSec` read. */
export const pacedCompress = async (inPath, outPath, options = {}) => {
  const rateBytesPerSec = options.rateBytesPerSec ?? 16 * 1048576;
  const startedAt = performance.now();
  let bytes = 0;
  const throttle = new Transform({
    async transform(chunk, _encoding, done) {
      bytes += chunk.length;
      const dueMs = (bytes / rateBytesPerSec) * 1000 - (performance.now() - startedAt);
      if (dueMs > 0) await sleep(dueMs);
      done(null, chunk);
    }
  });
  try {
    await pipeline(
      createReadStream(inPath, { highWaterMark: 1048576 }),
      throttle,
      // Content checksum on: without it a damaged download decompresses
      // "successfully" into a silently wrong database (zstd -t checks it too).
      createZstdCompress({ params: { [zlibConstants.ZSTD_c_checksumFlag]: 1 } }),
      createWriteStream(outPath)
    );
  } catch (error) {
    rmSync(outPath, { force: true });
    throw error;
  }
  return { compressMs: Math.round(performance.now() - startedAt), compressedBytes: statSync(outPath).size };
};

const main = async () => {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const flag = (name, fallback) => {
    const hit = args.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? Number(hit.split("=")[1]) : fallback;
  };
  const [dbPath, outPath] = positional;
  if (!dbPath || !outPath || !outPath.endsWith(".zst")) {
    console.error("usage: backup-snapshot.mjs <db> <out.zst> [--rate-mb=16] [--chunk-mb=4] [--check]");
    process.exit(2);
  }
  if (!existsSync(dbPath)) throw new Error(`no database at ${dbPath}`);
  const rateBytesPerSec = flag("rate-mb", 16) * 1048576;
  const scratch = `${outPath.slice(0, -4)}.tmp`;
  try {
    const snapshot = await pacedSnapshot(dbPath, scratch, {
      rateBytesPerSec,
      chunkBytes: flag("chunk-mb", 4) * 1048576,
      check: args.includes("--check")
    });
    const compressed = await pacedCompress(scratch, outPath, { rateBytesPerSec });
    console.log(JSON.stringify({ ok: true, out: outPath, ...snapshot, ...compressed }));
  } finally {
    rmSync(scratch, { force: true });
  }
};

if (process.argv[1] === undefined || process.argv[1] === "-" || import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`backup-snapshot failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
