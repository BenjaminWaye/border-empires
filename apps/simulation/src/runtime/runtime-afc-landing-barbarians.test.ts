import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// End-to-end regression for "I spawned and barbarians were all over my
// territory, and my AFC had no reach on one side": the only open tile on a
// barbarian-held island is the spawn tile, and a barbarian-held town sits
// just past the AFC's radius-3 reach (so its own radius-3 disk overlaps the
// AFC's). After landing, the AFC's whole 7x7 must be the player's and the
// barbarians inside it gone; barbarians beyond it stay.
const SPAWN = { x: 10, y: 10 };
const barbTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "barbarian-1",
  ownershipState: "SETTLED",
  ...extra
});

const buildIsland = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y <= 20; y += 1) {
    for (let x = 0; x <= 20; x += 1) {
      if (x === SPAWN.x && y === SPAWN.y) tiles.push({ x, y, terrain: "LAND" });
      else if (x === 15 && y === 10) tiles.push(barbTile(x, y, { town: { type: "FARMING", populationTier: "SETTLEMENT" } }));
      else tiles.push(barbTile(x, y));
    }
  }
  return tiles;
};

describe("AFC landing among barbarians", () => {
  it("clears barbarians in the AFC's reach and grants the full reach disk despite a barbarian town just outside it", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["barbarian-1", buildPlayer("barbarian-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: buildIsland(), activeLocks: [] }
    });

    expect(runtime.ensurePlayerHasSpawnTerritory("newcomer")).toBe(true);

    const tiles = runtime.exportState().tiles;
    const byKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const chebyshev = (tile: { x: number; y: number }) => Math.max(Math.abs(tile.x - SPAWN.x), Math.abs(tile.y - SPAWN.y));

    const barbariansInReach = tiles.filter((tile) => tile.ownerId === "barbarian-1" && chebyshev(tile) <= 3);
    expect(barbariansInReach).toEqual([]);

    const owned = tiles.filter((tile) => tile.ownerId === "newcomer");
    expect(owned).toHaveLength(49);
    expect(byKey.get("10,10")?.afcJson).toBeDefined();
    expect(owned.every((tile) => chebyshev(tile) <= 3)).toBe(true);

    // The barbarians beyond the AFC's reach are untouched -- including the town.
    expect(byKey.get("14,10")?.ownerId).toBe("barbarian-1");
    expect(byKey.get("15,10")?.ownerId).toBe("barbarian-1");
  });
});
