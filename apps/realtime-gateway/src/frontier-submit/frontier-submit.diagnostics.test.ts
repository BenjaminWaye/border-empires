import { describe, expect, it, vi } from "vitest";
import { submitFrontierCommand } from "./frontier-submit.js";
import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";

// Uses the real command store path, with deterministic persistence and RPC delay.
describe("frontier command diagnostic stages", () => {
  it("separates persistence from simulation submission with the client's command identity", async () => {
    let now = 1000;
    const recordGatewayEvent = vi.fn();
    const store = new InMemoryGatewayCommandStore();
    const persist = store.persistQueuedCommand.bind(store);
    store.persistQueuedCommand = async (...args) => { now += 80; return persist(...args); };
    await submitFrontierCommand({ sessionId: "s", playerId: "p1", nextClientSeq: 1, nextServerAssignedClientSeq: 0 }, {
      type: "ATTACK", commandId: "client-command", clientSeq: 12, fromX: 1, fromY: 2, toX: 2, toY: 2
    }, {
      commandStore: store, now: () => now, recordGatewayEvent,
      sendJson: vi.fn(), submitCommand: async () => { now += 3000; }
    });
    expect(recordGatewayEvent.mock.calls.map((call) => call[2])).toEqual([
      expect.objectContaining({ commandId: "client-command", playerId: "p1", stage: "received", elapsedMs: 0 }),
      expect.objectContaining({ stage: "persisted", elapsedMs: 80 }),
      expect.objectContaining({ stage: "simulation-submit-start", elapsedMs: 80 }),
      expect.objectContaining({ stage: "simulation-submit-complete", elapsedMs: 3080 })
    ]);
  });
});
