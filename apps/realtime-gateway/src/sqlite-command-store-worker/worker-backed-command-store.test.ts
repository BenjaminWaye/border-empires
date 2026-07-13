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
