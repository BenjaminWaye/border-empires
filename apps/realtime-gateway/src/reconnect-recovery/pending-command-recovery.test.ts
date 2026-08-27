import { describe, expect, it } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { toPendingGatewayCommands } from "./pending-command-recovery.js";
import { buildInitMessage } from "./reconnect-recovery.js";

describe("toPendingGatewayCommands", () => {
  it("includes QUEUED and ACCEPTED commands, with parsed move-payload coordinates", () => {
    const result = toPendingGatewayCommands([
      { commandId: "a", sessionId: "s", playerId: "p", clientSeq: 1, type: "EXPAND", payloadJson: "{\"fromX\":1,\"fromY\":2,\"toX\":3,\"toY\":4}", queuedAt: 100, status: "QUEUED" },
      { commandId: "b", sessionId: "s", playerId: "p", clientSeq: 2, type: "ATTACK", payloadJson: "{\"fromX\":5,\"fromY\":6,\"toX\":7,\"toY\":8}", queuedAt: 200, status: "ACCEPTED", acceptedAt: 250 }
    ]);

    expect(result).toEqual([
      { commandId: "a", clientSeq: 1, type: "EXPAND", status: "QUEUED", queuedAt: 100, payload: { fromX: 1, fromY: 2, toX: 3, toY: 4 } },
      { commandId: "b", clientSeq: 2, type: "ATTACK", status: "ACCEPTED", queuedAt: 200, acceptedAt: 250, payload: { fromX: 5, fromY: 6, toX: 7, toY: 8 } }
    ]);
  });

  it("excludes REJECTED and RESOLVED commands", () => {
    const result = toPendingGatewayCommands([
      { commandId: "a", sessionId: "s", playerId: "p", clientSeq: 1, type: "SETTLE", payloadJson: "{}", queuedAt: 100, status: "REJECTED", rejectedAt: 150, rejectedCode: "OUT_OF_REACH", rejectedMessage: "no" },
      { commandId: "b", sessionId: "s", playerId: "p", clientSeq: 2, type: "SETTLE", payloadJson: "{}", queuedAt: 100, status: "RESOLVED", resolvedAt: 150 }
    ]);

    expect(result).toEqual([]);
  });

  it("omits payload for a command whose stored JSON has no move coordinates", () => {
    const result = toPendingGatewayCommands([
      { commandId: "a", sessionId: "s", playerId: "p", clientSeq: 1, type: "COLLECT_TILE", payloadJson: "{\"x\":1,\"y\":2}", queuedAt: 100, status: "ACCEPTED", acceptedAt: 150 }
    ]);

    expect(result).toEqual([{ commandId: "a", clientSeq: 1, type: "COLLECT_TILE", status: "ACCEPTED", queuedAt: 100, acceptedAt: 150 }]);
    expect(result[0]).not.toHaveProperty("payload");
  });
});

describe("buildInitMessage reconnect recovery -- resolved/rejected exclusion", () => {
  it("drops resolved and rejected commands from reconnect recovery", async () => {
    const store = new InMemoryGatewayCommandStore();
    await store.persistQueuedCommand(
      { commandId: "cmd-resolved", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1000, type: "EXPAND", payloadJson: "{}" },
      Date.now()
    );
    await store.markResolved("cmd-resolved", Date.now());
    await store.persistQueuedCommand(
      { commandId: "cmd-rejected", sessionId: "session-1", playerId: "player-1", clientSeq: 2, issuedAt: 1000, type: "EXPAND", payloadJson: "{}" },
      Date.now()
    );
    await store.markRejected("cmd-rejected", Date.now(), "NOT_ADJACENT", "not adjacent");

    const init = await buildInitMessage({ playerId: "player-1", playerName: "Nauticus" }, store);

    expect(init.recovery).toEqual({ nextClientSeq: 3, pendingCommands: [] });
  });
});
