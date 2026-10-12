import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "../config.js";
import { setWorldSeed, terrainAt } from "./worldgen.js";
import { headwaterMountainAt, riverHeadsForCurrentSeed, riverHeadsOf } from "./worldgen-river-heads.js";
import { riversForCurrentSeed } from "./worldgen-rivers.js";

describe("river heads", () => {
  it("is empty for v1-v8 (tile-centre rivers)", () => {
    setWorldSeed(555, "continents", 8);
    expect(riverHeadsForCurrentSeed().size).toBe(0);
  });

  it("has one head per v9 river, on its first corner, heading along its first edge", () => {
    setWorldSeed(555, "continents", 9);
    const rivers = riversForCurrentSeed();
    const heads = riverHeadsForCurrentSeed();
    expect(heads.size).toBe(rivers.length);
    for (const path of rivers) {
      const head = heads.get(path[0]!.wy * WORLD_WIDTH + path[0]!.wx)!;
      expect(head.corner).toEqual({ x: path[0]!.wx, y: path[0]!.wy });
      expect(Math.abs(head.heading.dx) + Math.abs(head.heading.dy)).toBe(1);
      if (head.mountain) expect(terrainAt(head.mountain.x, head.mountain.y)).toBe("MOUNTAIN");
    }
    // Memoized per seed.
    expect(riverHeadsForCurrentSeed()).toBe(heads);
  });

  it("reads the heading across the world wrap", () => {
    const heads = riverHeadsOf([[{ wx: WORLD_WIDTH - 1, wy: 5, halfWidth: 0.1 }, { wx: 0, wy: 5, halfWidth: 0.1 }]]);
    expect(heads.get(5 * WORLD_WIDTH + WORLD_WIDTH - 1)!.heading).toEqual({ dx: 1, dy: 0 });
  });
});

describe("headwaterMountainAt", () => {
  const only = (mx: number, my: number) => (x: number, y: number) => x === mx && y === my;

  it("finds a mountain one ring out from the corner, not one touching the corner", () => {
    // Corner (10, 10); tile (10, 8) touches neighbouring corner (10, 9) -> one ring out.
    expect(headwaterMountainAt(10, 10, 0, 1, only(10, 8))).toEqual({ x: 10, y: 8 });
    // Tile (10, 10) touches the corner itself (can't happen for a clear corner) -> ignored.
    expect(headwaterMountainAt(10, 10, 0, 1, only(10, 10))).toBeNull();
    // Diagonal 4x4 corners are two corners away -> ignored.
    expect(headwaterMountainAt(10, 10, 0, 1, only(11, 11))).toBeNull();
  });

  it("prefers the mountain behind the river's heading", () => {
    const behind = (x: number, y: number): boolean => (x === 10 && y === 8) || (x === 10 && y === 11);
    // Heading south (+y): the north tile (10, 8) is behind it.
    expect(headwaterMountainAt(10, 10, 0, 1, behind)).toEqual({ x: 10, y: 8 });
    // Heading north: the south tile (10, 11) is behind it.
    expect(headwaterMountainAt(10, 10, 0, -1, behind)).toEqual({ x: 10, y: 11 });
  });
});
