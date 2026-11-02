import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Regression for reveal-map / season-end / spectator snapshots: those paths use
// the full-world export (runtime.exportState/exportStateAsync), which used to
// drop reachOwnerId. Both map renderers read reachOwnerId for rival reach
// borders and incursion hatching, so a full-visibility reveal showed owned
// territory but no borders and no hatch from fighting.
const buildRuntime = (): SimulationRuntime =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000 })]]),
    initialState: {
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
        // Neutral land inside player-1's town reach: no ownerId, but the
        // persistent border still covers it.
        { x: 1, y: 0, terrain: "LAND" },
        { x: 30, y: 30, terrain: "LAND" }
      ],
      activeLocks: []
    }
  });

const tilesByKey = (tiles: Array<{ x: number; y: number }>): Map<string, { x: number; y: number }> =>
  new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile] as const));

describe("full-world export reachOwnerId", () => {
  it("includes reachOwnerId for reach-covered tiles in exportState()", () => {
    const tiles = tilesByKey(buildRuntime().exportState().tiles);

    expect(tiles.get("0,0")).toMatchObject({ reachOwnerId: "player-1" });
    // Reach coverage is not limited to owned tiles — unowned ground inside a
    // border must carry the reach owner so clients can draw the border/hatch.
    expect(tiles.get("1,0")).toMatchObject({ reachOwnerId: "player-1" });
    // Outside every reach: omitted (truthy-guard convention), not null.
    expect(tiles.get("30,30")).not.toHaveProperty("reachOwnerId");
  });

  it("includes reachOwnerId in exportStateAsync()", async () => {
    const tiles = tilesByKey((await buildRuntime().exportStateAsync(async () => {})).tiles);

    expect(tiles.get("1,0")).toMatchObject({ reachOwnerId: "player-1" });
    expect(tiles.get("30,30")).not.toHaveProperty("reachOwnerId");
  });
});
