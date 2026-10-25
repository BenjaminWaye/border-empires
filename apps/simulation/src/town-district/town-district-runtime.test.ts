import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer } from "../runtime/runtime.test-helpers.js";

describe("district runtime projection paths", () => {
  it("carries the same authoritative anchor through login, detail, and first reveal", () => {
    const runtime = new SimulationRuntime({ now: () => 1_000,
      initialPlayers: new Map([["p1", buildPlayer("p1")]]),
      initialState: { tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
          town: { name: "Home", type: "MARKET", populationTier: "METROPOLIS" } },
        { x: 12, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED",
          economicStructure: { type: "MANUFACTORY", ownerId: "p1", status: "active" } }
      ], activeLocks: [] }
    });
    const anchor = '"supportAnchor":{"x":10,"y":10}';
    expect(runtime.wireDeltaForTileKey("12,10", "p1")?.economicStructureJson).toContain(anchor);
    expect(runtime.exportVisibleStateForPlayer("p1").tiles.find(tile => tile.x === 12)?.economicStructureJson).toContain(anchor);
    expect(runtime.filterTileDeltasForPlayer([{ x: 12, y: 10 }], "p1")[0]?.economicStructureJson).toContain(anchor);
    // Checkpoint/domain records retain only gameplay state, never viewer metadata.
    expect(runtime.exportState().tiles.find(tile => tile.x === 12)?.economicStructureJson).not.toContain("supportAnchor");
  });
});
