// Regression tests for the hourly backup snapshot (deploy/bin/backup-snapshot.mjs)
// and the restore check (deploy/bin/restore-prepare.mjs).
//
// The stall this guards against: the old snapshot was one `VACUUM INTO`, a
// single statement that read and wrote the whole database in one burst and
// stalled the live game 1-2 s per run on a production-sized server
// (scripts/sector-memory-probe/backup-stall-probe.mjs measures that end to end;
// docs/agents/deploys.md "Backups" has the numbers). A unit test cannot
// reproduce disk pressure, so it pins the properties that removed it: the copy
// is paced (never faster than the configured rate), made of many small steps,
// lets the game commit while it runs, and is still one consistent point in time.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { pacedCompress, pacedSnapshot } from "../../deploy/bin/backup-snapshot.mjs";
import { prepareRestore } from "../../deploy/bin/restore-prepare.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const MB = 1048576;

const makeLiveDb = (dir, { blobRows = 600, blobBytes = 8192 } = {}) => {
  const file = path.join(dir, "live.db");
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA user_version = 7;
    PRAGMA application_id = 4242;
    CREATE TABLE world_snapshots (snapshot_id INTEGER PRIMARY KEY, last_applied_event_id INTEGER NOT NULL, snapshot_payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE world_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT, payload BLOB);
    CREATE INDEX world_events_player_idx ON world_events(player_id);
    CREATE TABLE ledger_a (n INTEGER NOT NULL);
    CREATE TABLE ledger_b (n INTEGER NOT NULL);
    CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID;
    CREATE TABLE "odd ""name""" (x INTEGER, doubled INTEGER GENERATED ALWAYS AS (x * 2) STORED);
    CREATE UNIQUE INDEX kv_v ON kv(v);
    CREATE VIEW latest_snapshot AS SELECT max(snapshot_id) AS id FROM world_snapshots;
    CREATE TRIGGER kv_touch AFTER INSERT ON kv BEGIN UPDATE kv SET v = NEW.v WHERE k = NEW.k; END;
  `);
  const insertEvent = db.prepare("INSERT INTO world_events (player_id, payload) VALUES (?, randomblob(?))");
  db.exec("BEGIN");
  for (let i = 0; i < blobRows; i += 1) insertEvent.run(`p${i % 17}`, blobBytes);
  for (let i = 0; i < 50; i += 1) db.prepare("INSERT INTO kv VALUES (?, ?)").run(`k${i}`, `v${i}`);
  for (let i = 0; i < 20; i += 1) db.prepare('INSERT INTO "odd ""name""" (x) VALUES (?)').run(i);
  db.prepare("INSERT INTO world_snapshots VALUES (1, ?, 'payload', 1)").run(blobRows);
  db.exec("DELETE FROM world_events WHERE event_id % 5 = 0"); // gaps in rowids
  db.exec("COMMIT");
  return { file, db };
};

test("paced snapshot is one consistent point in time while the game keeps committing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "be-backup-"));
  try {
    const { file, db } = makeLiveDb(dir);
    // The "game": commits a pair of rows in one transaction every few ms. Any
    // copy that is a true snapshot has equal ledger_a / ledger_b counts.
    let commits = 0;
    const writeA = db.prepare("INSERT INTO ledger_a VALUES (?)");
    const writeB = db.prepare("INSERT INTO ledger_b VALUES (?)");
    const writer = setInterval(() => {
      db.exec("BEGIN IMMEDIATE");
      writeA.run(commits);
      writeB.run(commits);
      db.exec("COMMIT");
      commits += 1;
    }, 5);
    const out = path.join(dir, "copy.db");
    let result;
    try {
      result = await pacedSnapshot(file, out, { rateBytesPerSec: 6 * MB, chunkBytes: 256 * 1024, check: true });
    } finally {
      clearInterval(writer);
    }
    assert.ok(commits >= 20, `the game should keep committing during the copy (got ${commits})`);
    assert.ok(result.steps > 10, `the copy should be many small steps (got ${result.steps})`);

    const copy = new DatabaseSync(out, { readOnly: true });
    const count = (d, table) => d.prepare(`SELECT count(*) AS n FROM ${table}`).get().n;
    assert.equal(count(copy, "ledger_a"), count(copy, "ledger_b"), "copy must not tear a transaction");
    assert.ok(count(copy, "ledger_a") < commits, "copy is the state when it started, not later commits");
    for (const table of ["world_events", "world_snapshots", "kv", '"odd ""name"""']) {
      assert.equal(count(copy, table), count(db, table), table);
    }
    assert.deepEqual(
      copy.prepare("SELECT event_id, player_id, payload FROM world_events ORDER BY event_id").all(),
      db.prepare("SELECT event_id, player_id, payload FROM world_events ORDER BY event_id").all()
    );
    assert.deepEqual(copy.prepare('SELECT x, doubled FROM "odd ""name""" ORDER BY x').all(), db.prepare('SELECT x, doubled FROM "odd ""name""" ORDER BY x').all());
    const schemaOf = (d) => d.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    assert.deepEqual(schemaOf(copy), schemaOf(db));
    assert.deepEqual(copy.prepare("SELECT * FROM sqlite_sequence").all(), db.prepare("SELECT * FROM sqlite_sequence").all());
    assert.equal(copy.prepare("PRAGMA user_version").get().user_version, 7);
    assert.equal(copy.prepare("PRAGMA application_id").get().application_id, 4242);
    assert.equal(copy.prepare("SELECT id FROM latest_snapshot").get().id, 1);
    copy.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("paced snapshot never copies faster than its rate", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "be-backup-"));
  try {
    const { file, db } = makeLiveDb(dir, { blobRows: 1000, blobBytes: 8192 }); // ~8 MB
    db.close();
    const t0 = performance.now();
    const result = await pacedSnapshot(file, path.join(dir, "copy.db"), { rateBytesPerSec: 8 * MB, chunkBytes: 512 * 1024 });
    const seconds = (performance.now() - t0) / 1000;
    // A single VACUUM INTO of this file takes a few ms; paced at 8 MB/s it must take about bytes/rate.
    assert.ok(seconds >= (result.bytes / (8 * MB)) * 0.8, `copied ${result.bytes} bytes in ${seconds.toFixed(2)}s`);
    assert.ok(result.maxStepMs < 250, `no single step may run long (max ${result.maxStepMs}ms)`);

    const zst = path.join(dir, "copy.db.zst");
    const t1 = performance.now();
    await pacedCompress(path.join(dir, "copy.db"), zst, { rateBytesPerSec: 16 * MB });
    assert.ok((performance.now() - t1) / 1000 >= (result.bytes / (16 * MB)) * 0.8, "compression is paced too");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backup and restore round trip through the CLIs the server runs (stdin into node)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "be-backup-"));
  try {
    const { file, db } = makeLiveDb(dir, { blobRows: 200 });
    const expected = db.prepare("SELECT count(*) AS n, max(event_id) AS last FROM world_events").get();
    db.close();
    const runStdin = (script, args) =>
      spawnSync(process.execPath, ["--input-type=module", "-", ...args], {
        input: readFileSync(path.join(repoRoot, "deploy/bin", script)),
        encoding: "utf8"
      });
    const zst = path.join(dir, "be-test.db.zst");
    const backup = runStdin("backup-snapshot.mjs", [file, zst, "--rate-mb=64"]);
    assert.equal(backup.status, 0, backup.stderr);
    assert.equal(JSON.parse(backup.stdout.trim().split("\n").at(-1)).ok, true);
    assert.ok(!existsSync(zst.replace(/\.zst$/, ".tmp")), "scratch copy is removed");

    const restored = path.join(dir, "restored.db");
    const restore = runStdin("restore-prepare.mjs", [zst, restored]);
    assert.equal(restore.status, 0, restore.stderr);
    const summary = JSON.parse(restore.stdout.trim().split("\n").at(-1));
    assert.equal(summary.latestEventId, expected.last);
    assert.equal(summary.latestSnapshotId, 1);
    const check = new DatabaseSync(restored, { readOnly: true });
    assert.equal(check.prepare("SELECT count(*) AS n FROM world_events").get().n, expected.n);
    check.close();

    // A damaged download is refused and leaves nothing behind.
    const bytes = readFileSync(zst);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    const damaged = path.join(dir, "damaged.db.zst");
    writeFileSync(damaged, bytes);
    const bad = runStdin("restore-prepare.mjs", [damaged, path.join(dir, "bad.db")]);
    assert.notEqual(bad.status, 0);
    assert.ok(!existsSync(path.join(dir, "bad.db")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restore check refuses a database that fails integrity_check", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "be-backup-"));
  try {
    const { file, db } = makeLiveDb(dir, { blobRows: 300 });
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const root = db.prepare("SELECT rootpage FROM sqlite_schema WHERE name = 'world_events_player_idx'").get().rootpage;
    db.exec("PRAGMA journal_mode = DELETE");
    db.close();
    // Scribble over the cells of an index's b-tree root page.
    const bytes = readFileSync(file);
    const start = (root - 1) * 4096;
    bytes.fill(0x5a, start + 12, start + 4096);
    const corrupt = path.join(dir, "corrupt.db");
    writeFileSync(corrupt, bytes);
    const zst = path.join(dir, "corrupt.db.zst");
    const { createZstdCompress } = await import("node:zlib");
    const { pipeline } = await import("node:stream/promises");
    const { createReadStream, createWriteStream } = await import("node:fs");
    await pipeline(createReadStream(corrupt), createZstdCompress(), createWriteStream(zst));
    await assert.rejects(prepareRestore(zst, path.join(dir, "out.db")), /integrity_check failed|malformed|corrupt/i);
    assert.ok(!existsSync(path.join(dir, "out.db")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
