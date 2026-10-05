import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

describe("SimulationRuntime relay beacon vision", () => {
  it("restores relay-bonus and reach vision into the coverage cache on boot", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 100 })],
        ["player-2", buildPlayer("player-2", { manpower: 100 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 60,
            y: 60,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "RELAY_BEACON", status: "active" }
          },
          { x: 65, y: 60, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 66, y: 60, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const filtered = runtime.filterTileDeltasForPlayer([
      { x: 65, y: 60, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
      { x: 66, y: 60, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
    ], "player-1");

    expect(filtered.some((delta) => delta.x === 65 && delta.y === 60)).toBe(true);
    expect(filtered.some((delta) => delta.x === 66 && delta.y === 60)).toBe(true);
  });
});
