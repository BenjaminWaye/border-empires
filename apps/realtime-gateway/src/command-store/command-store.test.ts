import { describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "./command-store.js";

describe("InMemoryGatewayCommandStore", () => {
  it("tracks queued, accepted, rejected, and resolved command state", async () => {
    const store = new InMemoryGatewayCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1234,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1300
    );

    await expect(store.get("cmd-1")).resolves.toMatchObject({
      commandId: "cmd-1",
      status: "QUEUED",
      queuedAt: 1300
    });

    await store.markAccepted("cmd-1", 1400);
    await expect(store.get("cmd-1")).resolves.toMatchObject({
      status: "ACCEPTED",
      acceptedAt: 1400
    });

    await store.markResolved("cmd-1", 1500);
    await expect(store.get("cmd-1")).resolves.toMatchObject({
      status: "RESOLVED",
      resolvedAt: 1500
    });

    await store.markRejected("cmd-1", 1600, "SIMULATION_UNAVAILABLE", "command could not be queued in simulation");
    await expect(store.get("cmd-1")).resolves.toMatchObject({
      status: "REJECTED",
      rejectedAt: 1600,
      rejectedCode: "SIMULATION_UNAVAILABLE"
    });
  });

  it("deduplicates player/clientSeq pairs", async () => {
    const store = new InMemoryGatewayCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 7,
        issuedAt: 1234,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1300
    );
    await store.persistQueuedCommand(
      {
        commandId: "cmd-2",
        sessionId: "session-2",
        playerId: "player-1",
        clientSeq: 7,
        issuedAt: 1235,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1301
    );

    await expect(store.findByPlayerSeq("player-1", 7)).resolves.toMatchObject({
      commandId: "cmd-1",
      clientSeq: 7
    });
    await expect(store.get("cmd-2")).resolves.toBeUndefined();
  });

  it("lists unresolved commands and computes the next client sequence", async () => {
    const store = new InMemoryGatewayCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1000,
        type: "ATTACK",
        payloadJson: "{}"
      },
      1001
    );
    await store.persistQueuedCommand(
      {
        commandId: "cmd-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 3,
        issuedAt: 1002,
        type: "ATTACK",
        payloadJson: "{}"
      },
      1003
    );
    await store.markAccepted("cmd-2", 1004);
    await store.markResolved("cmd-1", 1005);

    await expect(store.listUnresolvedForPlayer("player-1")).resolves.toMatchObject([
      { commandId: "cmd-2", clientSeq: 3, status: "ACCEPTED" }
    ]);
    await expect(store.nextClientSeqForPlayer("player-1")).resolves.toBe(4);
  });
});
