import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, beforeEach } from "vitest";

const _require = createRequire(import.meta.url);
const { DatabaseSync } = _require("node:sqlite") as typeof import("node:sqlite");

import { SqliteWriterChannel } from "./sqlite-writer-channel/sqlite-writer-channel.js";
import { SqliteSimulationCommandStore } from "./sqlite-command-store.js";
import { SqliteSimulationEventStore } from "./sqlite-event-store.js";
import { SqliteSimulationSnapshotStore } from "./sqlite-snapshot-store/sqlite-snapshot-store.js";

// Regression for retention pruning added alongside the 2026-07-14 staging
// login-stall incident: commands/command_results were insert-only and never
// pruned, so every process restart replayed an ever-growing backlog during
// boot recovery, which starved the gateway thread of the shared vCPU and
// stalled logins for 80-100+ seconds. pruneAndCheckpoint now also deletes
// RESOLVED/REJECTED commands rows older than SIMULATION_COMMAND_RETENTION_MS.
describe("sqlite-writer-worker retention pruning", () => {
  let dbDir: string | undefined;
  let channel: SqliteWriterChannel | undefined;
  const originalRetentionMs = process.env.SIMULATION_COMMAND_RETENTION_MS;

  beforeEach(() => {
    // 1ms retention so any command queued more than 1ms ago is eligible for
    // pruning — avoids the test needing to actually wait out a real window.
    process.env.SIMULATION_COMMAND_RETENTION_MS = "1";
  });

  afterEach(async () => {
    await channel?.terminate();
    channel = undefined;
    if (dbDir) rmSync(dbDir, { recursive: true, force: true });
    dbDir = undefined;
    if (originalRetentionMs === undefined) delete process.env.SIMULATION_COMMAND_RETENTION_MS;
    else process.env.SIMULATION_COMMAND_RETENTION_MS = originalRetentionMs;
  });

  const makeDb = async (): Promise<string> => {
    dbDir = mkdtempSync(join(tmpdir(), "writer-worker-retention-"));
    const dbPath = join(dbDir, "test.db");
    const db = new DatabaseSync(dbPath);
    await new SqliteSimulationCommandStore(db as never).applySchema();
    await new SqliteSimulationEventStore(db as never).applySchema();
    await new SqliteSimulationSnapshotStore(db as never).applySchema();
    db.close();
    return dbPath;
  };

  it("prunes RESOLVED/REJECTED commands older than SIMULATION_COMMAND_RETENTION_MS but keeps the client_seq watermark", async () => {
    const dbPath = await makeDb();
    channel = new SqliteWriterChannel(dbPath);

    const oldQueuedAt = Date.now() - 60_000; // older than the 1ms retention set in beforeEach
    await channel.post({
      op: "persistQueuedCommand",
      commandId: "cmd-old-resolved",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 7,
      commandType: "EXPAND",
      payloadJson: "{}",
      queuedAt: oldQueuedAt
    });
    await channel.post({ op: "markResolved", commandId: "cmd-old-resolved", createdAt: oldQueuedAt + 1 });

    // A still-QUEUED command (e.g. never got a chance to run) must survive pruning
    // regardless of age — it's still needed for boot recovery.
    await channel.post({
      op: "persistQueuedCommand",
      commandId: "cmd-old-queued",
      sessionId: "session-1",
      playerId: "player-2",
      clientSeq: 3,
      commandType: "EXPAND",
      payloadJson: "{}",
      queuedAt: oldQueuedAt
    });

    await channel.post({ op: "pruneAndCheckpoint" });

    const db = new DatabaseSync(dbPath);
    const commandRows = db.prepare(`SELECT command_id FROM commands ORDER BY command_id ASC`).all() as Array<{ command_id: string }>;
    const watermarkRows = db
      .prepare(`SELECT player_id, max_client_seq FROM client_seq_watermarks ORDER BY player_id ASC`)
      .all() as Array<{ player_id: string; max_client_seq: number }>;
    db.close();

    expect(commandRows.map((r) => r.command_id)).toEqual(["cmd-old-queued"]);
    expect(watermarkRows).toEqual([
      { player_id: "player-1", max_client_seq: 7 },
      { player_id: "player-2", max_client_seq: 3 }
    ]);
  });

  it("does not prune anything when SIMULATION_COMMAND_RETENTION_MS is 0 (disabled)", async () => {
    process.env.SIMULATION_COMMAND_RETENTION_MS = "0";
    const dbPath = await makeDb();
    channel = new SqliteWriterChannel(dbPath);

    const oldQueuedAt = Date.now() - 60_000;
    await channel.post({
      op: "persistQueuedCommand",
      commandId: "cmd-old-resolved",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      commandType: "EXPAND",
      payloadJson: "{}",
      queuedAt: oldQueuedAt
    });
    await channel.post({ op: "markResolved", commandId: "cmd-old-resolved", createdAt: oldQueuedAt + 1 });
    await channel.post({ op: "pruneAndCheckpoint" });

    const db = new DatabaseSync(dbPath);
    const commandRows = db.prepare(`SELECT command_id FROM commands`).all() as Array<{ command_id: string }>;
    db.close();

    expect(commandRows.map((r) => r.command_id)).toEqual(["cmd-old-resolved"]);
  });
});
