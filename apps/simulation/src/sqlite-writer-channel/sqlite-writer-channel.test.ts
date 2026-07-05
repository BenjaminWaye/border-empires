import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SqliteWriterChannel } from "./sqlite-writer-channel.js";

// Regression for the 2026-07-05 staging OOM: SqliteWriterChannel.pending had
// no depth cap, so a writer worker falling behind (persistence backlog under
// AI-accrual load) let the sim thread pile up unbounded in-flight messages —
// each held in memory until the worker drained the backlog — turning a
// temporary slowdown into runaway heap growth and an eventual sim-worker OOM.
// These tests pin the fix: post() must self-throttle once pending hits its
// cap, releasing writers only as earlier ones ack.
describe("SqliteWriterChannel backpressure", () => {
  let dbDir: string | undefined;
  let channel: SqliteWriterChannel | undefined;

  afterEach(async () => {
    await channel?.terminate();
    channel = undefined;
    if (dbDir) rmSync(dbDir, { recursive: true, force: true });
    dbDir = undefined;
  });

  const makeDb = (): string => {
    dbDir = mkdtempSync(join(tmpdir(), "writer-channel-backpressure-"));
    const dbPath = join(dbDir, "test.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE world_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE commands (
        command_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        client_seq INTEGER NOT NULL,
        command_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        queued_at INTEGER NOT NULL
      );
      CREATE TABLE command_results (
        command_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        accepted_at INTEGER,
        rejected_at INTEGER,
        rejected_code TEXT,
        rejected_message TEXT,
        resolved_at INTEGER
      );
    `);
    db.close();
    return dbPath;
  };

  it("never lets pending in-flight messages exceed maxPending", async () => {
    const dbPath = makeDb();
    let maxObservedDepth = 0;
    let backpressureWaits = 0;
    channel = new SqliteWriterChannel(dbPath, {
      maxPending: 3,
      onQueueDepthChanged: (depth) => {
        maxObservedDepth = Math.max(maxObservedDepth, depth);
      },
      onBackpressureWait: () => {
        backpressureWaits += 1;
      }
    });

    // Fire far more concurrent appendEvent posts than maxPending allows.
    const posts = Array.from({ length: 20 }, (_, i) =>
      channel!.post({
        op: "appendEvent",
        commandId: `cmd-${i}`,
        playerId: "player-1",
        eventType: "TILE_YIELD_ANCHOR_BATCH",
        payloadJson: JSON.stringify({ i }),
        createdAt: Date.now()
      })
    );

    await Promise.all(posts);

    expect(maxObservedDepth).toBeLessThanOrEqual(3);
    // With 20 posts and a cap of 3, at least some callers must have queued
    // behind the cap — zero would mean the cap never actually engaged.
    expect(backpressureWaits).toBeGreaterThan(0);
  });

  it("still resolves every post correctly once the queue drains", async () => {
    const dbPath = makeDb();
    channel = new SqliteWriterChannel(dbPath, { maxPending: 2 });

    const commandIds = Array.from({ length: 10 }, (_, i) => `cmd-${i}`);
    await Promise.all(
      commandIds.map((commandId) =>
        channel!.post({
          op: "appendEvent",
          commandId,
          playerId: "player-1",
          eventType: "TILE_YIELD_ANCHOR_BATCH",
          payloadJson: JSON.stringify({ commandId }),
          createdAt: Date.now()
        })
      )
    );

    const db = new DatabaseSync(dbPath);
    const rows = db.prepare(`SELECT command_id FROM world_events ORDER BY event_id ASC`).all() as Array<{
      command_id: string;
    }>;
    db.close();
    expect(rows.map((r) => r.command_id)).toEqual(commandIds);
  });
});
