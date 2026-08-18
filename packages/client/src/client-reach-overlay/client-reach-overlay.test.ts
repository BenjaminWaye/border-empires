import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import {
  DEFAULT_PYLON_SPACING_TILES,
  filterReachToLand,
  isCornerAt,
  samplePerimeterPylons,
  traceReachBoundaryEdgeLoops,
  type CornerCoord,
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
 * `traceReachBoundaryEdgeLoops` result has, unlike a plain straight line
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

/** Every consecutive pair of corners (including the wrap back to the first) is a real unit grid step. */
const consecutiveCornersAreUnitSteps = (loop: CornerCoord[]): boolean => {
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const isUnitStep = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    if (!isUnitStep) return false;
  }
  return true;
};

describe("traceReachBoundaryEdgeLoops", () => {
  it("traces a single closed loop of unit grid-edges around a plain square region", () => {
    const region = rect(10, 10, 19, 19); // 10x10 square of tiles
    const deps = buildDeps(region);
    const reach = toReach(region);
    const loops = traceReachBoundaryEdgeLoops(reach, deps);

    expect(loops.length).toBe(1);
    const loop = loops[0]!;
    // Every step in the traced loop is a real, literal 1-unit grid edge --
    // this is what makes the "jump between unrelated components" bug the
    // old tile-walk had structurally impossible.
    expect(consecutiveCornersAreUnitSteps(loop)).toBe(true);
    expect(new Set(loop.map((c) => keyFor(c.x, c.y))).size).toBe(loop.length);
    // The four outer corners of the region (tile 19's far corner is at
    // grid position 20) must all appear.
    for (const corner of [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }]) {
      expect(loop).toContainEqual(corner);
    }
  });

  it("traces the exact 4-corner unit square for a single-tile boundary", () => {
    const region: TileCoord[] = [{ x: 5, y: 5 }];
    const deps = buildDeps(region);
    const reach = toReach(region);
    const loops = traceReachBoundaryEdgeLoops(reach, deps);
    expect(loops.length).toBe(1);
    const loop = loops[0]!;
    expect(loop.length).toBe(4);
    expect(consecutiveCornersAreUnitSteps(loop)).toBe(true);
    for (const corner of [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }]) {
      expect(loop).toContainEqual(corner);
    }
  });

  it("traces an irregular/notched boundary (an L-shaped region) fully, with no infinite loop", () => {
    // An L-shape: a 10x10 block with a 4x4 notch bitten out of one corner.
    const block = rect(0, 0, 9, 9);
    const notch = new Set(rect(6, 6, 9, 9).map((c) => keyFor(c.x, c.y)));
    const region = block.filter((c) => !notch.has(keyFor(c.x, c.y)));
    const deps = buildDeps(region);
    const reach = toReach(region);

    const loops = traceReachBoundaryEdgeLoops(reach, deps);
    expect(loops.length).toBe(1);
    const loop = loops[0]!;
    expect(consecutiveCornersAreUnitSteps(loop)).toBe(true);
    expect(new Set(loop.map((c) => keyFor(c.x, c.y))).size).toBe(loop.length);
  });

  it("produces one loop per disconnected owned region", () => {
    const regionA = rect(0, 0, 5, 5);
    const regionB = rect(20, 20, 25, 25); // far away, no shared boundary tiles
    const region = [...regionA, ...regionB];
    const deps = buildDeps(region);
    const reach = toReach(region);

    const loops = traceReachBoundaryEdgeLoops(reach, deps);
    expect(loops.length).toBe(2);
    for (const loop of loops) {
      expect(consecutiveCornersAreUnitSteps(loop)).toBe(true);
      const xs = loop.map((c) => c.x);
      const allInA = xs.every((x) => x <= 6);
      const allInB = xs.every((x) => x >= 20);
      expect(allInA || allInB).toBe(true);
    }
  });

  it("separates an outer boundary from an inner hole's boundary into two distinct loops -- the case the old tile-walk got wrong", () => {
    // A 12x12 block with a 2x2 hole cut clean out of the middle (not
    // touching any outer edge) -- e.g. a lake/mountain carved out by
    // filterReachToLand. The old tile-adjacency walk could hop between the
    // outer boundary and this inner hole's boundary when they passed close
    // together, producing a chord straight across the interior. This
    // tracer can't do that: every edge it emits is a literal tile-to-
    // neighbour boundary, so the outer ring and the hole's ring never share
    // an edge and always come out as two separate small loops.
    const block = rect(0, 0, 11, 11);
    const hole = new Set(rect(5, 5, 6, 6).map((c) => keyFor(c.x, c.y)));
    const region = block.filter((c) => !hole.has(keyFor(c.x, c.y)));
    const deps = buildDeps(region);
    const reach = toReach(region);

    const loops = traceReachBoundaryEdgeLoops(reach, deps);
    expect(loops.length).toBe(2);
    for (const loop of loops) expect(consecutiveCornersAreUnitSteps(loop)).toBe(true);
    // One loop is the small hole ring (its corners span exactly 5..7), the
    // other is the large outer ring (spans the full 0..12 block) -- neither
    // loop should contain points from both scales, which is exactly what a
    // bad cross-component hop would produce.
    const spans = loops.map((loop) => {
      const xs = loop.map((c) => c.x);
      return Math.max(...xs) - Math.min(...xs);
    });
    spans.sort((a, b) => a - b);
    expect(spans[0]).toBe(2); // the hole ring: corners 5..7
    expect(spans[1]).toBe(12); // the outer ring: corners 0..12
  });

  it("returns no loops when the reach set is empty", () => {
    const deps = buildDeps([]);
    expect(traceReachBoundaryEdgeLoops(new Set(), deps)).toEqual([]);
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

describe("filterReachToLand", () => {
  const makeTerrainTile = (x: number, y: number, terrain: "LAND" | "SEA" | "COASTAL_SEA"): Tile =>
    ({ x, y, terrain }) as unknown as Tile;

  it("drops SEA and COASTAL_SEA tiles from the reach set", () => {
    const coords = rect(0, 0, 4, 4);
    const tiles = new Map<string, Tile>();
    for (const { x, y } of coords) {
      const terrain = x === 4 ? "SEA" : y === 4 ? "COASTAL_SEA" : "LAND";
      tiles.set(keyFor(x, y), makeTerrainTile(x, y, terrain));
    }
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    for (const { x, y } of coords) {
      const isWater = x === 4 || y === 4;
      expect(filtered.has(keyFor(x, y))).toBe(!isWater);
    }
  });

  it("keeps a tile that was never a water tile", () => {
    const coords = rect(0, 0, 2, 2);
    const tiles = new Map<string, Tile>();
    for (const { x, y } of coords) tiles.set(keyFor(x, y), makeTerrainTile(x, y, "LAND"));
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    expect(filtered.size).toBe(coords.length);
  });

  it("a coastal reach square's traced boundary hugs the shoreline instead of the raw disk edge", () => {
    // A 0..6 square where the entire southern half (y >= 4) is open sea --
    // simulates a coastal town whose reach radius geometrically extends
    // past the shore. Without filtering, the traced loop would run along
    // grid line y=7 (the raw edge of the reach disk, out over open water);
    // filtered, it should hug the y=4 grid line (the actual coastline)
    // instead -- the corner sitting exactly on the land/sea edge, not out
    // over the water tiles themselves.
    const coords = rect(0, 0, 6, 6);
    const tiles = new Map<string, Tile>();
    for (const { x, y } of coords) tiles.set(keyFor(x, y), makeTerrainTile(x, y, y >= 4 ? "SEA" : "LAND"));
    const reach = toReach(coords);
    const filtered = filterReachToLand(reach, tiles, keyFor);
    const deps: ReachBoundaryDeps = { tiles, keyFor, wrapX: wrap, wrapY: wrap };
    const loops = traceReachBoundaryEdgeLoops(filtered, deps);
    const allY = loops.flat().map((c) => c.y);
    expect(Math.max(...allY)).toBeLessThanOrEqual(4);
  });
});

describe("samplePerimeterPylons", () => {
  it("rejects a segment between two walk-adjacent samples that are geometrically far apart, instead of drawing a line across the map", () => {
    // Defensive backstop, kept even though traceReachBoundaryEdgeLoops can no
    // longer produce this shape by construction (every edge it emits is a
    // real 1-unit grid step) -- a hand-built "loop" with one walk-adjacent
    // pair that's actually very far apart on the map, even though every
    // other step is a normal 1-tile move, to prove samplePerimeterPylons
    // itself never draws a chord across such a gap regardless of input.
    const loop: TileCoord[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 200, y: 200 }, // the "bad hop" -- far from its walk-neighbours
      { x: 201, y: 200 },
      { x: 202, y: 200 }
    ];
    const { segments } = samplePerimeterPylons([loop], 1);
    for (const segment of segments[0]!) {
      const dist = Math.max(Math.abs(segment.to.x - segment.from.x), Math.abs(segment.to.y - segment.from.y));
      expect(dist).toBeLessThanOrEqual(3);
    }
  });

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
