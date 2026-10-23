import type { Terrain } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { fullyHeldIslandIds, type IslandHoldTile } from "./client-island-hold.js";

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

const heldIds = (tiles: Map<string, IslandHoldTile>, terrain = terrainAt): string[] =>
  fullyHeldIslandIds(
    [...tiles.entries()].filter(([, t]) => t.ownerId === "p1").map(([k]) => { const [x, y] = k.split(",").map(Number); return { x: x!, y: y! }; }),
    { ...deps(tiles), terrainAt: terrain }
  );

describe("fullyHeldIslandIds on a landmass with a mountain", () => {
  it("returns the landmass's anchor id (first tile in row-major order) when every LAND tile is my garrison", () => {
    expect(heldIds(holdAll("p1"))).toEqual(["5,2"]);
  });

  it("returns nothing when one LAND tile is not mine", () => {
    expect(heldIds(holdAll("p1", "8,4"))).toEqual([]);
    expect(heldIds(holdAll("p2"))).toEqual([]);
  });

  it("refuses islets smaller than the naming floor", () => {
    const tiny = (x: number, y: number): Terrain => (x === 2 && y === 2 ? "LAND" : "SEA");
    const tiles = new Map<string, IslandHoldTile>([["2,2", { terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }]]);
    expect(heldIds(tiles, tiny)).toEqual([]);
  });
});

describe("fullyHeldIslandIds", () => {
  // Two 4x3 islands in a 20x10 world: A at (2..5, 2..4), B at (10..13, 2..4).
  const twoIslands = (x: number, y: number): Terrain => (y >= 2 && y <= 4 && ((x >= 2 && x <= 5) || (x >= 10 && x <= 13)) ? "LAND" : "SEA");
  const garrisons = (keys: (x: number) => boolean): Map<string, IslandHoldTile> => {
    const tiles = new Map<string, IslandHoldTile>();
    for (let y = 2; y <= 4; y += 1) for (let x = 0; x < 20; x += 1) {
      if (twoIslands(x, y) !== "LAND") continue;
      tiles.set(`${x},${y}`, keys(x) ? { terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" } : { terrain: "LAND" });
    }
    return tiles;
  };
  const scan = (tiles: Map<string, IslandHoldTile>) =>
    fullyHeldIslandIds(
      [...tiles.entries()].filter(([, t]) => t.ownerId === "p1").map(([k]) => { const [x, y] = k.split(",").map(Number); return { x: x!, y: y! }; }),
      { me: "p1", tileAt: (x, y) => tiles.get(`${x},${y}`), terrainAt: twoIslands, width: 20, height: 10 }
    );

  it("lists every landmass held whole, once each", () => {
    expect(scan(garrisons(() => true)).sort()).toEqual(["10,2", "2,2"]);
  });

  it("skips a landmass with one tile not garrisoned", () => {
    expect(scan(garrisons((x) => x !== 13))).toEqual(["2,2"]);
  });
});
