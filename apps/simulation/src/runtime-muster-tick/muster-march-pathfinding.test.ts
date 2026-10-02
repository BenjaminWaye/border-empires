import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { buildTerrainDistanceField } from "./muster-march-pathfinding.js";

// A 30x30 land block with a wall of sea at x=15 (gap at y=29) so the true
// walking distance across it is much longer than the straight line.
const SIZE = 30;
const tiles = new Map<string, DomainTileState>();
for (let x = 0; x < SIZE; x += 1) {
  for (let y = 0; y < SIZE; y += 1) {
    const wall = x === 15 && y < SIZE - 1;
    tiles.set(simulationTileKey(x, y), { x, y, terrain: wall ? "SEA" : "LAND" } as DomainTileState);
  }
}
const getTile = (x: number, y: number) => tiles.get(simulationTileKey(x, y));

describe("buildTerrainDistanceField", () => {
  it("routes around water instead of using the straight line", () => {
    const field = buildTerrainDistanceField(20, 5, getTile, 200);
    // Straight-line distance from (10,5) to (20,5) is 10; the wall forces a detour via y=29.
    expect(field.get(simulationTileKey(10, 5))).toBeGreaterThan(20);
  });

  it("stopping at a tile keeps every tile closer than it, with identical distances", () => {
    const full = buildTerrainDistanceField(20, 5, getTile, 200);
    const stopKey = simulationTileKey(24, 5);
    const early = buildTerrainDistanceField(20, 5, getTile, 200, stopKey);
    const stopDist = full.get(stopKey)!;
    expect(early.get(stopKey)).toBe(stopDist);
    for (const [key, distance] of full) {
      if (distance < stopDist) expect(early.get(key)).toBe(distance);
    }
    // ...and it really did stop early rather than flooding everything.
    expect(early.size).toBeLessThan(full.size / 2);
    // Tiles it left out are never closer than the stop tile.
    for (const [key, distance] of full) {
      if (!early.has(key)) expect(distance).toBeGreaterThanOrEqual(stopDist);
    }
  });

  it("runs to the step cap when the stop tile cannot be reached", () => {
    const sea = simulationTileKey(15, 3);
    const early = buildTerrainDistanceField(20, 5, getTile, 6, sea);
    const capped = buildTerrainDistanceField(20, 5, getTile, 6);
    expect(early.size).toBe(capped.size);
    expect(early.has(sea)).toBe(false);
  });

  it("wraps around the world edge like the rest of the muster code", () => {
    const wrapTiles = new Map<string, DomainTileState>();
    for (const x of [0, 1, WORLD_WIDTH - 1]) wrapTiles.set(simulationTileKey(x, 5), { x, y: 5, terrain: "LAND" } as DomainTileState);
    const field = buildTerrainDistanceField(0, 5, (x, y) => wrapTiles.get(simulationTileKey(x, y)), 5);
    expect(field.get(simulationTileKey(WORLD_WIDTH - 1, 5))).toBe(1);
    expect(field.get(simulationTileKey(1, 5))).toBe(1);
  });
});
