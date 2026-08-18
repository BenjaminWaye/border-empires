import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  DEFAULT_PYLON_SPACING_TILES,
  samplePerimeterPylons,
  traceReachBoundaryLoops,
  type ReachBoundaryDeps,
  type TileCoord
} from "./client-reach-overlay.js";

const GRID = 40;
const keyFor = (x: number, y: number): string => `${x},${y}`;
const wrap = (v: number): number => ((v % GRID) + GRID) % GRID;

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

describe("samplePerimeterPylons", () => {
  it("samples every Nth tile per loop and connects consecutive samples, closing back to the first", () => {
    const loop: TileCoord[] = Array.from({ length: 30 }, (_, i) => ({ x: i, y: 0 }));
    const { pylons, segments } = samplePerimeterPylons([loop], 10);
    expect(pylons).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]]);
    expect(segments[0]).toEqual([
      { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
      { from: { x: 10, y: 0 }, to: { x: 20, y: 0 } },
      { from: { x: 20, y: 0 }, to: { x: 0, y: 0 } }
    ]);
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
    const loopA: TileCoord[] = Array.from({ length: 24 }, (_, i) => ({ x: i, y: 0 }));
    const loopB: TileCoord[] = Array.from({ length: 24 }, (_, i) => ({ x: i, y: 100 }));
    const { pylons } = samplePerimeterPylons([loopA, loopB], 12);
    expect(pylons.length).toBe(2);
    expect(pylons[0]!.length).toBe(2);
    expect(pylons[1]!.length).toBe(2);
  });
});
