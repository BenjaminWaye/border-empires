import { describe, expect, test } from "vitest";
import type { Terrain } from "../types.js";
import { buildDockLandingIndex, dockLandingGroundCoords, isCoastalGround, isDockLandingTile } from "./dock-landing.js";

// 10x10 world: sea everywhere except a land block x 4..8, y 2..8. Dock at
// (4,5) on its west shore; a far dock at (0,0) is a lone land tile.
const W = 10;
const H = 10;
const terrainGrid = (): Map<string, Terrain> => {
  const grid = new Map<string, Terrain>();
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      grid.set(`${x},${y}`, x >= 4 && x <= 8 && y >= 2 && y <= 8 ? "LAND" : "SEA");
    }
  }
  grid.set("0,0", "LAND");
  return grid;
};
const opts = { worldWidth: W, worldHeight: H, radius: 1 };

describe("dock landing ground", () => {
  test("coastal ground needs a cardinal water side", () => {
    const grid = terrainGrid();
    const at = (x: number, y: number) => grid.get(`${x},${y}`);
    expect(isCoastalGround(4, 4, at, W, H)).toBe(true);
    expect(isCoastalGround(5, 5, at, W, H)).toBe(false);
    expect(isCoastalGround(3, 5, at, W, H)).toBe(false);
  });

  test("landing ground is the dock plus coastal land within the radius", () => {
    const grid = terrainGrid();
    const at = (x: number, y: number) => grid.get(`${x},${y}`);
    const keys = dockLandingGroundCoords(4, 5, at, opts).map(({ x, y }) => `${x},${y}`);
    expect(keys[0]).toBe("4,5");
    expect(new Set(keys)).toEqual(new Set(["4,5", "4,4", "4,6"]));
  });

  test("isDockLandingTile rejects inland, water, out-of-radius and mountain tiles", () => {
    const grid = terrainGrid();
    const at = (x: number, y: number) => grid.get(`${x},${y}`);
    expect(isDockLandingTile(4, 5, 4, 5, at, opts)).toBe(true);
    expect(isDockLandingTile(4, 5, 4, 6, at, opts)).toBe(true);
    expect(isDockLandingTile(4, 5, 5, 5, at, opts)).toBe(false);
    expect(isDockLandingTile(4, 5, 3, 5, at, opts)).toBe(false);
    expect(isDockLandingTile(4, 5, 4, 7, at, opts)).toBe(false);
    grid.set("4,6", "MOUNTAIN");
    expect(isDockLandingTile(4, 5, 4, 6, at, opts)).toBe(false);
  });

  test("index links each origin dock to the linked dock's landing ground, with symmetric supply edges", () => {
    const grid = terrainGrid();
    const at = (x: number, y: number) => grid.get(`${x},${y}`);
    const links = new Map<string, readonly string[]>([
      ["0,0", ["4,5"]],
      ["4,5", ["0,0"]]
    ]);
    const index = buildDockLandingIndex(links, at, opts);
    expect(new Set(index.landingTileKeysByOriginDockKey.get("0,0"))).toEqual(new Set(["4,5", "4,4", "4,6"]));
    expect(index.landingTileKeysByOriginDockKey.get("4,5")).toEqual(["0,0"]);
    expect(index.seaLaneNeighborKeysByTileKey.get("4,4")).toEqual(["0,0"]);
    expect(new Set(index.seaLaneNeighborKeysByTileKey.get("0,0"))).toEqual(new Set(["4,5", "4,4", "4,6"]));
  });

  test("a coastal mountain stays in the static index so removing it later opens the beach", () => {
    const grid = terrainGrid();
    grid.set("4,6", "MOUNTAIN");
    const at = (x: number, y: number) => grid.get(`${x},${y}`);
    const index = buildDockLandingIndex(new Map([["0,0", ["4,5"]]]), at, opts);
    expect(index.landingTileKeysByOriginDockKey.get("0,0")).toContain("4,6");
  });
});
