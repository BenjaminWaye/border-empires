import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Regression coverage for a real bug: resource-reveal masking (Iron/Supply/
// Crystal hidden until researched) was only ever applied on the streaming
// tile-delta broadcast path (tile-delta-visibility-filter.ts). The login/
// full-export path a player actually uses on first connect
// (exportVisibleStateForPlayer / exportVisibleStateForPlayerAsync, both in
// runtime-visible-state.ts) has its own separate, independent tile
// projection (visibleTileProjection) that read tile.resource completely
// unmasked — so a fresh player with zero tech still saw every resource
// type immediately on login, even though the streaming path correctly hid
// them.
describe("simulation runtime — resource-reveal gating on the full-export (login) path", () => {
  it("masks TITANIUM/UMBRITE/CRYSTAL for a player with no reveal techs, reveals them with the right tech", () => {
    const buildRuntime = (techIds: string[]) =>
      new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([["player-1", buildPlayer("player-1", { techIds: new Set(techIds) })]]),
        initialState: {
          tiles: [
            {
              x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
              town: { name: "Capital", type: "FARMING", populationTier: "TOWN" }
            },
            { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "TITANIUM" },
            { x: 0, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "UMBRITE" },
            { x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
          ],
          activeLocks: []
        }
      });

    const findTile = (tiles: ReturnType<SimulationRuntime["exportVisibleStateForPlayer"]>["tiles"], x: number, y: number) =>
      tiles.find((t) => t.x === x && t.y === y);

    const noTech = buildRuntime([]);
    const noTechTiles = noTech.exportVisibleStateForPlayer("player-1").tiles;
    expect(findTile(noTechTiles, 1, 0)?.resource).toBeUndefined();
    expect(findTile(noTechTiles, 0, 1)?.resource).toBeUndefined();
    // FOOD is always visible, no tech required.
    expect(findTile(noTechTiles, 1, 1)?.resource).toBe("FARM");

    const withTech = buildRuntime(["masonry", "leatherworking"]);
    const withTechTiles = withTech.exportVisibleStateForPlayer("player-1").tiles;
    expect(findTile(withTechTiles, 1, 0)?.resource).toBe("TITANIUM");
    expect(findTile(withTechTiles, 0, 1)?.resource).toBe("UMBRITE");
  });
});
