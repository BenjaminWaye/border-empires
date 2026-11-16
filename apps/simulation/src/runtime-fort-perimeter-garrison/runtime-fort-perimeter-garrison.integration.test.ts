import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// A town at (0,0) puts everything below inside reach. The Fort goes on the
// garrisoned tile (2,0); (3,0) and (2,1) are frontier inside its radius-1
// perimeter, (4,0) is frontier just outside it.
describe("fort perimeter auto-garrison (runtime)", () => {
  it("garrisons the frontier tiles inside a finished Fort's perimeter and leaves the rest", async () => {
    vi.useFakeTimers();
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set(["masonry"]) })]]),
        initialState: {
          tiles: [
            { ...afcModuleFixtureTile("player-1"), x: 20, y: 20 },
            { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 0, y: -1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 2, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 2, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 4, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const events = collectEvents(runtime);
      runtime.submitCommand({
        commandId: "fort-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
        type: "BUILD_FORT", payloadJson: JSON.stringify({ x: 2, y: 0 })
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(events.filter((e) => e.eventType === "COMMAND_REJECTED")).toEqual([]);
      const at = (x: number, y: number) => runtime.exportState().tiles.find((t) => t.x === x && t.y === y);
      const fortAt = (x: number, y: number) => JSON.parse(at(x, y)?.fortJson ?? "null");
      expect(fortAt(2, 0)).toEqual(expect.objectContaining({ variant: "FORT", status: "under_construction" }));
      // Before the Fort stands, nothing is garrisoned for it.
      expect(at(3, 0)?.ownershipState).toBe("FRONTIER");

      await vi.advanceTimersByTimeAsync(60 * 60_000);

      expect(fortAt(2, 0)).toEqual(expect.objectContaining({ variant: "FORT", status: "active" }));
      expect(at(3, 0)?.ownershipState).toBe("SETTLED");
      expect(at(2, 1)?.ownershipState).toBe("SETTLED");
      expect(at(4, 0)?.ownershipState).toBe("FRONTIER");
    } finally {
      vi.useRealTimers();
    }
  });
});
