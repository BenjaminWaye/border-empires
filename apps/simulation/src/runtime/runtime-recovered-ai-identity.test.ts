import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { testRuntimePlayer } from "./runtime.test-helpers.js";

// Moved out of runtime.test.ts (far past the 500-line cap) when its recovered
// row gained manpowerUpdatedAt: without it the row reads as a brand-new empire
// and is granted the one-time landing manpower reserve, which this test isn't
// about.
describe("recovered player rows", () => {
  it("preserves AI identity from initial players when recovered player rows omit isAi", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["ai-1", testRuntimePlayer("ai-1", { isAi: true, name: "ai-1", strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 } })]
      ]),
      initialState: {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }],
        activeLocks: [],
        players: [
          {
            id: "ai-1",
            name: "ai-1",
            points: 77,
            manpower: 123,
            manpowerUpdatedAt: 1_000
          }
        ]
      }
    });

    expect(runtime.exportSnapshotSections().initialState.players).toContainEqual(
      expect.objectContaining({
        id: "ai-1",
        isAi: true,
        points: 77,
        manpower: 123
      })
    );
  });
});
