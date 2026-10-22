import type { Terrain } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { fullyHeldIslandIdAt, type IslandHoldTile } from "./client-island-hold.js";

// 20x10 world: a 4x3 island at (5..8, 2..4) with a mountain at (7, 3).
const terrainAt = (x: number, y: number): Terrain => (x >= 5 && x <= 8 && y >= 2 && y <= 4 ? (x === 7 && y === 3 ? "MOUNTAIN" : "LAND") : "SEA");

const holdAll = (owner: string, except?: string): Map<string, IslandHoldTile> => {
  const tiles = new Map<string, IslandHoldTile>();
  for (let y = 2; y <= 4; y += 1) for (let x = 5; x <= 8; x += 1) {
    const key = `${x},${y}`;
    const terrain = terrainAt(x, y);
    tiles.set(key, terrain === "LAND" && key !== except ? { terrain, ownerId: owner, ownershipState: "SETTLED" } : { terrain });
  }
  return tiles;
};

const deps = (tiles: Map<string, IslandHoldTile>) => ({ me: "p1", tileAt: (x: number, y: number) => tiles.get(`${x},${y}`), terrainAt, width: 20, height: 10 });

describe("fullyHeldIslandIdAt", () => {
  it("returns the island's anchor id (first tile in row-major order) when every LAND tile is my garrison", () => {
    expect(fullyHeldIslandIdAt(8, 4, deps(holdAll("p1")))).toBe("5,2");
  });

  it("returns nothing when one LAND tile is not mine, or for sea", () => {
    expect(fullyHeldIslandIdAt(5, 2, deps(holdAll("p1", "8,4")))).toBeUndefined();
    expect(fullyHeldIslandIdAt(5, 2, deps(holdAll("p2")))).toBeUndefined();
    expect(fullyHeldIslandIdAt(0, 0, deps(holdAll("p1")))).toBeUndefined();
  });

  it("refuses islets smaller than the naming floor", () => {
    const tiny = (x: number, y: number): Terrain => (x === 2 && y === 2 ? "LAND" : "SEA");
    const tiles = new Map<string, IslandHoldTile>([["2,2", { terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }]]);
    expect(fullyHeldIslandIdAt(2, 2, { ...deps(tiles), terrainAt: tiny })).toBeUndefined();
  });
});
