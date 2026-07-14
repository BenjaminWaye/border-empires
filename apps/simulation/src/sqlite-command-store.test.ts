import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { SqliteSimulationCommandStore } from "./sqlite-command-store.js";

// Vitest's bundler can't resolve `node:sqlite` at static analysis time
// (Node 22+ builtin), so we pull DatabaseSync via createRequire — runs
// in the same process but bypasses Vite's module graph.
type DatabaseSyncCtor = new (path: string) => unknown;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: DatabaseSyncCtor;
};

const createStore = async (): Promise<SqliteSimulationCommandStore> => {
  const db = new DatabaseSync(":memory:") as ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
  const store = new SqliteSimulationCommandStore(db);
  await store.applySchema();
  return store;
};

const testCommand = (commandId: string) => ({
  commandId,
  sessionId: "session-1",
  playerId: "ai-1",
  clientSeq: 1,
  issuedAt: 100,
  type: "EXPAND" as const,
  payloadJson: "{}"
});

// SELECT_JOINED is an INNER JOIN between commands and command_results.
// Regression for /admin/debug/ai's recentCommands (and GetRecentCommands
// generally) reading permanently empty: markAccepted/markRejected only
// UPDATE an existing command_results row — if persistQueuedCommand was
// never called first, there's no row for the JOIN to match, so every
// get()/loadAllCommands() call silently returns nothing even after commands
// are accepted or rejected. See simulation-persistence-queue.ts's
// enqueueQueuedCommand for the production wiring that now calls
// persistQueuedCommand before the ACCEPTED/REJECTED event is persisted.
describe("SqliteSimulationCommandStore", () => {
  it("returns the persisted+accepted row via the commands/command_results JOIN", async () => {
    const store = await createStore();

    await store.persistQueuedCommand(testCommand("cmd-1"), 100);
    await store.markAccepted("cmd-1", 110);

    await expect(store.get("cmd-1")).resolves.toMatchObject({
      commandId: "cmd-1",
      status: "ACCEPTED",
      playerId: "ai-1",
      type: "EXPAND",
      acceptedAt: 110
    });
    await expect(store.loadAllCommands()).resolves.toEqual([
      expect.objectContaining({ commandId: "cmd-1", status: "ACCEPTED" })
    ]);
  });

  it("regression: marking a command accepted/rejected without persisting it first silently no-ops (documents the JOIN gap)", async () => {
    const store = await createStore();

    // No persistQueuedCommand call — this is the exact bug: markAccepted
    // runs but there's no commands/command_results row for it to update.
    await store.markAccepted("cmd-never-queued", 110);

    await expect(store.get("cmd-never-queued")).resolves.toBeUndefined();
    await expect(store.loadAllCommands()).resolves.toEqual([]);
  });

  it("persists the QUEUED row immediately, before any status transition", async () => {
    const store = await createStore();

    await store.persistQueuedCommand(testCommand("cmd-2"), 100);

    await expect(store.get("cmd-2")).resolves.toMatchObject({ commandId: "cmd-2", status: "QUEUED" });
  });

  it("supports the full QUEUED -> REJECTED lifecycle", async () => {
    const store = await createStore();

    await store.persistQueuedCommand(testCommand("cmd-3"), 100);
    await store.markRejected("cmd-3", 110, "BAD_COMMAND", "nope");

    await expect(store.get("cmd-3")).resolves.toMatchObject({
      status: "REJECTED",
      rejectedAt: 110,
      rejectedCode: "BAD_COMMAND",
      rejectedMessage: "nope"
    });
  });

  it("is idempotent when persistQueuedCommand is called twice for the same commandId (at-least-once retry safety)", async () => {
    const store = await createStore();

    await store.persistQueuedCommand(testCommand("cmd-4"), 100);
    await store.markAccepted("cmd-4", 110);
    await store.persistQueuedCommand(testCommand("cmd-4"), 100);

    await expect(store.get("cmd-4")).resolves.toMatchObject({ status: "ACCEPTED" });
    await expect(store.loadAllCommands()).resolves.toHaveLength(1);
  });

  // Regression for the staging boot crash-loop (2026-07-14): the seq counter
  // was reseeded from loadRecoverableCommands (QUEUED/ACCEPTED only), so once
  // a player's commands resolved/rejected the max was understated, the
  // producer reissued a low seq, and the UNIQUE(player_id, client_seq) index
  // rejected it — a deterministic failure that repeated on every restart.
  // loadMaxClientSeqByPlayer must count ALL rows regardless of status.
  it("loadMaxClientSeqByPlayer counts RESOLVED/REJECTED rows, not just recoverable ones", async () => {
    const store = await createStore();
    const cmd = (commandId: string, playerId: string, clientSeq: number) => ({
      commandId,
      sessionId: "session-1",
      playerId,
      clientSeq,
      issuedAt: 100,
      type: "EXPAND" as const,
      payloadJson: "{}"
    });

    // player-a: highest seq (3) is a RESOLVED command — invisible to loadRecoverableCommands.
    await store.persistQueuedCommand(cmd("a-1", "player-a", 1), 100);
    await store.markAccepted("a-1", 101);
    await store.persistQueuedCommand(cmd("a-3", "player-a", 3), 102);
    await store.markResolved("a-3", 103);
    // player-b: highest seq (2) is a REJECTED command — also invisible to loadRecoverableCommands.
    await store.persistQueuedCommand(cmd("b-2", "player-b", 2), 104);
    await store.markRejected("b-2", 105, "BAD", "nope");

    await expect(store.loadMaxClientSeqByPlayer()).resolves.toEqual({
      "player-a": 3,
      "player-b": 2
    });

    // Contrast: the recovery view would have understated both, which is the bug.
    const recoverableMax = (await store.loadRecoverableCommands())
      .filter((c) => c.playerId === "player-a")
      .reduce((max, c) => Math.max(max, c.clientSeq), 0);
    expect(recoverableMax).toBe(1);
  });

  it("loadMaxClientSeqByPlayer returns an empty map when no commands exist", async () => {
    const store = await createStore();
    await expect(store.loadMaxClientSeqByPlayer()).resolves.toEqual({});
  });
});
