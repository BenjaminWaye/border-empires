import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

describe("auto-garrison completion with a mirrored queue entry", () => {
  it("does not start the same tile again when its slot frees", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delay, task) => { scheduled.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 100_000, manpower: 100_000, manpowerUpdatedAt: 1_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 50, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "GREAT_CITY", population: 2_000_000 } },
          ...[48, 49, 51].map((x) => ({ x, y: 50, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const }))
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);
    await runtime.tickTerritoryAutomation(1_000);
    const starts = () => events.filter((event) => event.eventType === "SETTLEMENT_STARTED");
    expect(starts()).toHaveLength(3);
    const manpowerBeforeMirror = runtime.exportState().players.find((player) => player.id === "player-1")?.manpower;
    runtime.submitCommand({
      commandId: "mirror", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "DEV_QUEUE_ENQUEUE", payloadJson: JSON.stringify({ kind: "SETTLE", tileKey: "48,50", x: 48, y: 50 })
    });
    await Promise.resolve();
    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.devQueue).toHaveLength(1);
    scheduled[0]!();
    expect(starts()).toHaveLength(3);
    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.manpower).toBe(manpowerBeforeMirror);
    expect(runtime.exportState().pendingSettlements.map((entry) => entry.tileKey)).not.toContain("48,50");
    expect(runtime.exportState().tiles.find((tile) => tile.x === 48 && tile.y === 50)?.ownershipState).toBe("SETTLED");
  });
});
