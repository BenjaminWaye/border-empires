import { describe, expect, it } from "vitest";

import { InMemorySimulationCommandStore } from "./command-store.js";

describe("InMemorySimulationCommandStore", () => {
  it("deduplicates queued commands by command id and player sequence", async () => {
    const store = new InMemorySimulationCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1_100
    );
    await store.persistQueuedCommand(
      {
        commandId: "cmd-2",
        sessionId: "session-2",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_005,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1_101
    );

    const commands = await store.loadAllCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]?.commandId).toBe("cmd-1");
  });

  it("updates accepted, rejected, and resolved statuses", async () => {
    const store = new InMemorySimulationCommandStore();
    await store.persistQueuedCommand(
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: "{}"
      },
      1_100
    );

    await store.markAccepted("cmd-1", 1_200);
    expect((await store.get("cmd-1"))?.status).toBe("ACCEPTED");

    await store.markResolved("cmd-1", 1_300);
    expect((await store.get("cmd-1"))?.status).toBe("RESOLVED");

    await store.persistQueuedCommand(
      {
        commandId: "cmd-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: "{}"
      },
      1_101
    );
    await store.markRejected("cmd-2", 1_250, "BAD_COMMAND", "invalid command payload");

    expect(await store.get("cmd-2")).toMatchObject({
      status: "REJECTED",
      rejectedCode: "BAD_COMMAND",
      rejectedMessage: "invalid command payload"
    });
  });
});
