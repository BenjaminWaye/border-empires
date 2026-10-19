import { createRequire } from "node:module";
import { SqliteSimulationCommandStore } from "../../../simulation/src/sqlite-command-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkerBackedGatewayCommandStore } from "./worker-backed-command-store.js";

const makeCommand = (overrides: Partial<Parameters<WorkerBackedGatewayCommandStore["persistQueuedCommand"]>[0]> = {}) => ({
  commandId: "cmd-1",
  sessionId: "session-1",
  playerId: "player-1",
  clientSeq: 1,
  issuedAt: 1234,
  type: "ATTACK" as const,
  payloadJson: "{}",
  ...overrides
});

describe("WorkerBackedGatewayCommandStore", () => {
  let dir: string;
  let sqlitePath: string;
  let store: WorkerBackedGatewayCommandStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "command-store-worker-test-"));
    sqlitePath = join(dir, "commands.sqlite");
    store = new WorkerBackedGatewayCommandStore({ sqlitePath, applySchema: true });
    await store.waitUntilReady();
  });

  afterEach(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("persists a queued command and reads it back via get()", async () => {
    const stored = await store.persistQueuedCommand(makeCommand(), 1300);
    expect(stored.commandId).toBe("cmd-1");
    expect(stored.status).toBe("QUEUED");

    const fetched = await store.get("cmd-1");
    expect(fetched?.commandId).toBe("cmd-1");
  });

  it("preserves internal diplomacy rows across both schema owners and keeps client dedup separate", async () => {
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
      DatabaseSync: new (path: string) => ConstructorParameters<typeof SqliteSimulationCommandStore>[0];
    };
    const db = new DatabaseSync(sqlitePath);
    try {
      const simulationStore = new SqliteSimulationCommandStore(db);
      db.exec("DROP INDEX commands_player_seq_idx; CREATE UNIQUE INDEX commands_player_seq_idx ON commands(player_id, client_seq)");
      await simulationStore.persistQueuedCommand({ ...makeCommand(), type: "SYNC_TRUCE", commandId: "historical-social", clientSeq: 0 }, 900);
      await store.close();
      store = new WorkerBackedGatewayCommandStore({ sqlitePath, applySchema: true });
      await store.waitUntilReady();
      await simulationStore.applySchema();
      for (const [i, type] of (["SYNC_TRUCE", "SYNC_ALLIANCE", "SETTLE_DIPLOMACY_TERMS"] as const).entries()) {
        await simulationStore.persistQueuedCommand({ ...makeCommand(), type, commandId: `social-${i}`, clientSeq: 0 }, 1000 + i);
      }
      await store.close();
      store = new WorkerBackedGatewayCommandStore({ sqlitePath, applySchema: true });
      await store.waitUntilReady();
      expect(await store.findByPlayerSeq("player-1", 0)).toBeUndefined();
      const stored = await store.persistQueuedCommand(makeCommand({ commandId: "client-zero", clientSeq: 0 }), 1100);
      expect(stored.commandId).toBe("client-zero");
      const duplicate = await store.persistQueuedCommand(makeCommand({ commandId: "duplicate-zero", clientSeq: 0 }), 1200);
      expect(duplicate.commandId).toBe("client-zero");
      expect(await store.get("social-2")).toMatchObject({ commandId: "social-2" });
      await simulationStore.persistQueuedCommand({ ...makeCommand(), type: "SYNC_TRUCE", commandId: "social-after-restart", clientSeq: 0 }, 1300);
    } finally { db.close(); }
  });

  it("returns undefined for a command that was never persisted", async () => {
    await expect(store.get("missing")).resolves.toBeUndefined();
  });

  it("tracks per-player client sequence and unresolved commands across the accept/resolve lifecycle", async () => {
    await store.persistQueuedCommand(makeCommand({ commandId: "cmd-1", clientSeq: 1 }), 1000);
    await store.persistQueuedCommand(makeCommand({ commandId: "cmd-2", clientSeq: 2 }), 1001);

    expect(await store.nextClientSeqForPlayer("player-1")).toBe(3);

    let unresolved = await store.listUnresolvedForPlayer("player-1");
    expect(unresolved.map((c) => c.commandId).sort()).toEqual(["cmd-1", "cmd-2"]);

    await store.markAccepted("cmd-1", 1100);
    await store.markResolved("cmd-1", 1200);
    await store.markRejected("cmd-2", 1150, "INVALID", "bad move");

    unresolved = await store.listUnresolvedForPlayer("player-1");
    expect(unresolved).toEqual([]);

    const resolved = await store.findByPlayerSeq("player-1", 1);
    expect(resolved?.status).toBe("RESOLVED");
    const rejected = await store.get("cmd-2");
    expect(rejected?.status).toBe("REJECTED");
    expect(rejected?.rejectedCode).toBe("INVALID");
  });

  it("survives a worker restart and keeps serving requests against the same file", async () => {
    await store.persistQueuedCommand(makeCommand(), 1300);
    // @ts-expect-error -- reaching into the private worker to simulate a crash/respawn
    await store["worker"].terminate();
    const fetched = await store.get("cmd-1");
    expect(fetched?.commandId).toBe("cmd-1");
  });
});
