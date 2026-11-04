import { describe, expect, it } from "vitest";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { computeDominanceSizes } from "./season-summary-dominance-sizes.js";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

describe("computeDominanceSizes", () => {
  // Same count as the Diplomatic Dominance check: SETTLED + FRONTIER, doubled for Chancery V.
  it("counts controlled tiles with the diplomatic weight against the world's land", () => {
    const tiles = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "a", ownershipState: "SETTLED" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "a", ownershipState: "FRONTIER" },
      { x: 2, y: 0, terrain: "LAND", ownerId: "b", ownershipState: "SETTLED" },
      { x: 3, y: 0, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
      { x: 4, y: 0, terrain: "LAND" },
      { x: 5, y: 0, terrain: "SEA" }
    ] as RuntimeState["tiles"];
    const players = [
      { id: "a", domainIds: [] },
      { id: "b", domainIds: ["afc-chancery-5"] },
      { id: "c", domainIds: [] }
    ] as RuntimeState["players"];
    expect(computeDominanceSizes(tiles, players, new Set(["a", "b", "c"]))).toEqual({
      landTileCount: 5,
      dominanceTilesByPlayerId: { a: 2, b: 2 }
    });
  });
});
