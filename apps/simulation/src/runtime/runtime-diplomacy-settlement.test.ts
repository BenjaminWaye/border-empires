import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

describe("simulation runtime — diplomacy settlement", () => {
  // Two settlements share clientSeq 0 for the same player (the gateway
  // submits every one that way); the second must not be swallowed as a
  // replay of the first.
  it("applies repeated settlements for the same player, each resolved", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", { ...buildPlayer("player-1"), points: 100 }],
        ["player-2", { ...buildPlayer("player-2"), points: 0 }]
      ]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    const seen = collectEvents(runtime);
    for (const commandId of ["diplomacy-settle:a", "diplomacy-settle:b"]) {
      runtime.submitCommand({
        commandId,
        sessionId: "system-runtime:social",
        playerId: "player-1",
        clientSeq: 0,
        issuedAt: 1_000,
        type: "SETTLE_DIPLOMACY_TERMS",
        payloadJson: JSON.stringify({ proposerId: "player-1", targetId: "player-2", proposerPays: { gold: 30, shard: 0 }, targetPays: { gold: 0, shard: 0 } })
      });
      await Promise.resolve();
    }

    const points = (id: string) => runtime.exportState().players.find((player) => player.id === id)?.points;
    expect(points("player-1")).toBe(40);
    expect(points("player-2")).toBe(60);
    expect(seen.filter((event) => event.eventType === "COMMAND_RESOLVED").map((event) => event.commandId)).toEqual([
      "diplomacy-settle:a",
      "diplomacy-settle:b"
    ]);
  });
});
