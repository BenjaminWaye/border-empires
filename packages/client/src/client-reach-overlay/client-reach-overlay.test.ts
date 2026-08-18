import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  DEFAULT_PYLON_SPACING_TILES,
  isCornerAt,
  samplePerimeterPylons,
  traceReachBoundaryLoops,
  type ReachBoundaryDeps,
  type TileCoord
} from "./client-reach-overlay.js";

const GRID = 40;
const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => ((v % GRID) + GRID) % GRID;

/**
 * Builds a proper closed rectangle-outline loop (clockwise from top-left):
 * consecutive tiles are always exactly one step apart, including the wrap
 * from the last tile back to the first -- matching the shape a real
 * `traceReachBoundaryLoops` result has, unlike a plain straight line
 * (which isn't actually closed and produces a spurious "corner" purely
 * from the artificial jump back to its start).
 */
const rectLoop = (x0: number, y0: number, x1: number, y1: number): TileCoord[] => {
  const loop: TileCoord[] = [];
  for (let x = x0; x < x1; x += 1) loop.push({ x, y: y0 });
  for (let y = y0; y < y1; y += 1) loop.push({ x: x1, y });
  for (let x = x1; x > x0; x -= 1) loop.push({ x, y: y1 });
  for (let y = y1; y > y0; y -= 1) loop.push({ x: x0, y });
  return loop;
};

const makeTile = (x: number, y: number): Tile => ({ x, y, terrain: "LAND" }) as unknown as Tile;

const buildDeps = (coords: Iterable<TileCoord>): ReachBoundaryDeps => {
  const tiles = new Map<string, Tile>();
  for (const { x, y } of coords) tiles.set(keyFor(x, y), makeTile(x, y));
  return { tiles, keyFor, wrapX: wrap, wrapY: wrap };
};

/** Every (x,y) in an inclusive rectangle. */
const rect = (x0: number, y0: number, x1: number, y1: number): TileCoord[] => {
  const out: TileCoord[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) out.push({ x, y });
  }
  return out;
};

const toReach = (coords: TileCoord[]): Set<string> => new Set(coords.map((c) => keyFor(c.x, c.y)));

const allTilesVisited = (loops: TileCoord[][], expected: TileCoord[]): boolean => {
  const seen = new Set<string>();
  for (const loop of loops) for (const c of loop) seen.add(keyFor(c.x, c.y));
  return expected.every((c) => seen.has(keyFor(c.x, c.y))) && seen.size === expected.length;
};

const consecutiveTilesAreAdjacent = (loop: TileCoord[]): boolean => {
  for (let i = 1; i < loop.length; i += 1) {
    const a = loop[i - 1]!;
    const b = loop[i]!;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;
  }
  return true;
};

describe("traceReachBoundaryLoops", () => {
  it("traces a single loop around a plain square region, visiting every boundary tile exactly once", () => {
    const region = rect(10, 10, 19, 19); // 10x10 square
    const deps = buildDeps(region);
    const reach = toReach(region);
    const loops = traceReachBoundaryLoops(reach, deps);

    expect(loops.length).toBe(1);
    const loop = loops[0]!;
    // A 10x10 square's boundary ring is its outer 1-tile-thick perimeter.
    const expectedBoundary = region.filter((c) => c.x === 10 || c.x === 19 || c.y === 10 || c.y === 19);
    expect(allTilesVisited(loops, expectedBoundary)).toBe(true);
    expect(consecutiveTilesAreAdjacent(loop)).toBe(true);
    // No duplicate visits within the loop.
    expect(new Set(loop.map((c) => keyFor(c.x, c.y))).size).toBe(loop.length);
  });

  it("handles a single-tile boundary without error", () => {
    const region: TileCoord[] = [{ x: 5, y: 5 }];
    const deps = buildDeps(region);
    const reach = toReach(region);
    const loops = traceReachBoundaryLoops(reach, deps);
    expect(loops).toEqual([[{ x: 5, y: 5 }]]);
  });

  it("traces an irregular/notched boundary (an L-shaped region) fully, with no infinite loop", () => {
    // An L-shape: a 10x10 block with a 4x4 notch bitten out of one corner.
    const block = rect(0, 0, 9, 9);
    const notch = new Set(rect(6, 6, 9, 9).map((c) => keyFor(c.x, c.y)));
    const region = block.filter((c) => !notch.has(keyFor(c.x, c.y)));
    const deps = buildDeps(region);
    const reach = toReach(region);

    const loops = traceReachBoundaryLoops(reach, deps);
    expect(loops.length).toBe(1);
    const loop = loops[0]!;
    expect(consecutiveTilesAreAdjacent(loop)).toBe(true);
    expect(new Set(loop.map((c) => keyFor(c.x, c.y))).size).toBe(loop.length);
    // Every tile in the notched region that is actually a boundary tile
    // must show up somewhere in the trace.
    const boundaryTileKeys = new Set(
      region
        .filter((c) => {
          const neighbours = [
            keyFor(wrap(c.x), wrap(c.y - 1)),
            keyFor(wrap(c.x + 1), wrap(c.y)),
            keyFor(wrap(c.x), wrap(c.y + 1)),
            keyFor(wrap(c.x - 1), wrap(c.y))
          ];
          return neighbours.some((k) => !reach.has(k));
        })
        .map((c) => keyFor(c.x, c.y))
    );
    const tracedKeys = new Set(loop.map((c) => keyFor(c.x, c.y)));
    expect(tracedKeys).toEqual(boundaryTileKeys);
  });

  it("produces one loop per disconnected owned region", () => {
    const regionA = rect(0, 0, 5, 5);
    const regionB = rect(20, 20, 25, 25); // far away, no shared boundary tiles
    const region = [...regionA, ...regionB];
    const deps = buildDeps(region);
    const reach = toReach(region);

    const loops = traceReachBoundaryLoops(reach, deps);
    expect(loops.length).toBe(2);
    // Each loop should be confined to one region (no loop mixes tiles from
    // both regions), and together they cover every boundary tile exactly
    // once with no infinite/hanging walk.
    for (const loop of loops) {
      expect(consecutiveTilesAreAdjacent(loop)).toBe(true);
      const xs = loop.map((c) => c.x);
      const allInA = xs.every((x) => x <= 5);
      const allInB = xs.every((x) => x >= 20);
      expect(allInA || allInB).toBe(true);
    }
    const totalTraced = loops.reduce((n, l) => n + l.length, 0);
    const totalBoundary = region.filter((c) => {
      const neighbours = [
        keyFor(wrap(c.x), wrap(c.y - 1)),
        keyFor(wrap(c.x + 1), wrap(c.y)),
        keyFor(wrap(c.x), wrap(c.y + 1)),
        keyFor(wrap(c.x - 1), wrap(c.y))
      ];
      return neighbours.some((k) => !reach.has(k));
    }).length;
    expect(totalTraced).toBe(totalBoundary);
  });

  it("returns no loops when the reach set is empty", () => {
    const deps = buildDeps([]);
    expect(traceReachBoundaryLoops(new Set(), deps)).toEqual([]);
  });
});

describe("isCornerAt", () => {
  it("is false along a straight run", () => {
    const loop = rectLoop(0, 0, 10, 10);
    // Somewhere in the middle of the top edge, away from any corner.
    expect(isCornerAt(loop, 5)).toBe(false);
  });

  it("is true exactly at a rectangle's 4 corners", () => {
    const x0 = 0, y0 = 0, x1 = 8, y1 = 5;
    const loop = rectLoop(x0, y0, x1, y1);
    const topLen = x1 - x0;
    const rightLen = y1 - y0;
    const bottomLen = x1 - x0;
    const cornerIndices = [0, topLen, topLen + rightLen, topLen + rightLen + bottomLen];
    for (let i = 0; i < loop.length; i += 1) {
      expect(isCornerAt(loop, i)).toBe(cornerIndices.includes(i));
    }
  });

  it("is false for loops shorter than 3 tiles (no meaningful direction to compare)", () => {
    expect(isCornerAt([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0)).toBe(false);
  });
});

describe("samplePerimeterPylons", () => {
  it("always includes every true corner of a rectangular loop, even when spacing alone would skip it", () => {
    // A long thin rectangle: the top/bottom runs (20 tiles) are much longer
    // than the spacing (12), but the left/right runs (3 tiles) are much
    // shorter -- fixed-interval sampling alone could easily land its
    // periodic samples on the long runs and skip a short-run corner
    // entirely, which is exactly the bug being fixed here.
    const x0 = 0, y0 = 0, x1 = 20, y1 = 3;
    const loop = rectLoop(x0, y0, x1, y1);
    const topLen = x1 - x0;
    const rightLen = y1 - y0;
    const bottomLen = x1 - x0;
    const cornerIndices = [0, topLen, topLen + rightLen, topLen + rightLen + bottomLen];
    const expectedCorners = cornerIndices.map((i) => loop[i]!);
    const { pylons, segments } = samplePerimeterPylons([loop], 12);
    for (const corner of expectedCorners) {
      expect(pylons[0]).toContainEqual(corner);
    }
    // Every sample must connect to exactly one "next" segment (closed ring).
    expect(segments[0]!.length).toBe(pylons[0]!.length);
  });

  it("fills long straight runs between corners with extra evenly-spaced pylons, not just the corners", () => {
    // Top/bottom runs are 30 tiles, well past the 10-tile spacing -- each
    // must get interior pylons beyond its 2 corner endpoints.
    const loop = rectLoop(0, 0, 30, 2);
    const { pylons } = samplePerimeterPylons([loop], 10);
    const topRowPylons = pylons[0]!.filter((p) => p.y === 0);
    expect(topRowPylons.length).toBeGreaterThan(2);
  });

  it("never places two samples farther apart (in walk order) than the spacing, except across a short corner-to-corner run", () => {
    const loop = rectLoop(0, 0, 25, 25);
    const { pylons } = samplePerimeterPylons([loop], 12);
    const indices = pylons[0]!.map((p) => loop.findIndex((t) => t.x === p.x && t.y === p.y)).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i += 1) {
      const gap = i + 1 < indices.length ? indices[i + 1]! - indices[i]! : loop.length - indices[i]! + indices[0]!;
      expect(gap).toBeLessThanOrEqual(12);
    }
  });

  it("uses the default spacing within the brief's 10-15 tile range", () => {
    expect(DEFAULT_PYLON_SPACING_TILES).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_PYLON_SPACING_TILES).toBeLessThanOrEqual(15);
  });

  it("produces a single pylon and no segments for a loop shorter than the spacing", () => {
    const loop: TileCoord[] = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
    const { pylons, segments } = samplePerimeterPylons([loop], 12);
    expect(pylons).toEqual([[{ x: 1, y: 1 }]]);
    expect(segments).toEqual([[]]);
  });

  it("handles multiple loops independently", () => {
    const loopA = rectLoop(0, 0, 6, 6);
    const loopB = rectLoop(0, 100, 6, 106);
    const { pylons } = samplePerimeterPylons([loopA, loopB], 12);
    expect(pylons.length).toBe(2);
    // Each side of a 6x6 square is well under the 12-tile spacing, so only
    // the 4 mandatory corners should appear, nothing extra.
    expect(pylons[0]!.length).toBe(4);
    expect(pylons[1]!.length).toBe(4);
  });
});
