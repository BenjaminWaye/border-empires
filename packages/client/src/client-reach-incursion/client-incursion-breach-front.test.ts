import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { organicSideFront, type BreachPoint, type FrontNeighbourKind, type FrontSide } from "./client-incursion-breach-front.js";

const NORTH: FrontSide = { dx: 0, dy: -1, a: { x: -0.5, y: -0.5 }, t: { x: 1, y: 0 } };

// The tile itself is the pocket; anything unlisted is my land.
const around =
  (overrides: Record<string, FrontNeighbourKind>) =>
  (dx: number, dy: number): FrontNeighbourKind =>
    overrides[`${dx},${dy}`] ?? (dx === 0 && dy === 0 ? "pocket" : "mine");

const linePoints = (pieces: ReturnType<typeof organicSideFront>): BreachPoint[] => pieces.filter((p) => p.points.length === 4).flatMap((p) => p.points);
const teeth = (pieces: ReturnType<typeof organicSideFront>) => pieces.filter((p) => p.points.length === 3);
/** One tooth = a fan of triangles about its root centre: group by that centre, return each tooth's outline points, west to east. */
const toothOutlines = (pieces: ReturnType<typeof organicSideFront>): BreachPoint[][] => {
  const byRoot = new Map<string, BreachPoint[]>();
  for (const p of teeth(pieces)) {
    const key = `${p.points[0]!.x.toFixed(5)},${p.points[0]!.y.toFixed(5)}`;
    byRoot.set(key, [...(byRoot.get(key) ?? []), p.points[1]!, p.points[2]!]);
  }
  return [...byRoot.values()].sort((a, b) => a[0]!.x - b[0]!.x);
};
const toothHeight = (outline: readonly BreachPoint[]): number => Math.max(...outline.map((p) => p.y)) - Math.min(...outline.map((p) => p.y));

const centreline = (piece: { points: readonly BreachPoint[] }, end: 0 | 1): BreachPoint => {
  const [a, b, c, d] = piece.points as [BreachPoint, BreachPoint, BreachPoint, BreachPoint];
  return end === 0 ? { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 } : { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
};

describe("organicSideFront", () => {
  it("meets the neighbouring tile's line exactly where a straight front crosses a tile boundary", () => {
    // A front running east along two pocket tiles at world (4,7) and (5,7).
    const left = organicSideFront(NORTH, true, 4, 7, around({ "1,0": "pocket", "-1,0": "pocket" }));
    const right = organicSideFront(NORTH, true, 5, 7, around({ "1,0": "pocket", "-1,0": "pocket" }));
    const leftLine = left.filter((p) => p.points.length === 4);
    const rightLine = right.filter((p) => p.points.length === 4);
    const leftEnd = centreline(leftLine[leftLine.length - 1]!, 1);
    const rightStart = centreline(rightLine[0]!, 0);
    // Tile-local: the right tile's start sits one tile east of the left tile's end.
    expect(rightStart.x + 1).toBeCloseTo(leftEnd.x, 6);
    expect(rightStart.y).toBeCloseTo(leftEnd.y, 6);
  });

  it("still meets the neighbouring tile's line where the toroidal map wraps", () => {
    const run = around({ "1,0": "pocket", "-1,0": "pocket" });
    const lastColumn = organicSideFront(NORTH, true, WORLD_WIDTH - 1, 7, run).filter((p) => p.points.length === 4);
    const firstColumn = organicSideFront(NORTH, true, 0, 7, run).filter((p) => p.points.length === 4);
    const leftEnd = centreline(lastColumn[lastColumn.length - 1]!, 1);
    const rightStart = centreline(firstColumn[0]!, 0);
    expect(rightStart.x + 1).toBeCloseTo(leftEnd.x, 6);
    expect(rightStart.y).toBeCloseTo(leftEnd.y, 6);
  });

  it("meanders off the tile grid rather than running dead straight", () => {
    const ys = linePoints(organicSideFront(NORTH, false, 3, 9, around({ "1,0": "pocket", "-1,0": "pocket" }))).map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.04);
    // ...but stays close to the boundary.
    for (const y of ys) expect(Math.abs(y + 0.5)).toBeLessThan(0.12);
  });

  it("turns an outer corner square: the line runs right up to the corner, capped with a square", () => {
    // A lone pocket tile: the north side starts at the north-west outer corner.
    const pieces = organicSideFront(NORTH, true, 0, 0, around({}));
    const line = linePoints(pieces);
    // The stroke reaches the corner rather than pulling in from it (only the meander moves it).
    expect(Math.min(...line.map((p) => Math.hypot(p.x + 0.5, p.y + 0.5)))).toBeLessThan(0.12);
    // Exactly one square cap, over that start corner.
    const caps = pieces.filter((p) => p.points.length === 4 && Math.hypot(p.points[0]!.x - p.points[2]!.x, p.points[0]!.y - p.points[2]!.y) < 0.1 && Math.abs(Math.hypot(p.points[0]!.x - p.points[1]!.x, p.points[0]!.y - p.points[1]!.y) - Math.hypot(p.points[1]!.x - p.points[2]!.x, p.points[1]!.y - p.points[2]!.y)) < 1e-9);
    expect(caps).toHaveLength(1);
    // No tooth sits diagonally off the corner any more.
    expect(teeth(pieces).some((p) => p.points[2]!.x < -0.5 && p.points[2]!.y < -0.5)).toBe(false);
  });

  it("gives every piece a thin rim: its outer points pushed out by about a hundredth of a tile", () => {
    for (const piece of organicSideFront(NORTH, true, 2, 5, around({}))) {
      expect(piece.outline).toHaveLength(piece.points.length);
      // Tooth fan triangles share their root centre (inside the shape), which stays put; every other point grows.
      const outer = piece.points.length === 3 ? [1, 2] : [0, 1, 2, 3];
      for (const i of outer) {
        const grow = Math.hypot(piece.outline[i]!.x - piece.points[i]!.x, piece.outline[i]!.y - piece.points[i]!.y);
        expect(grow).toBeGreaterThan(0.005);
        // Even at a sharp tooth tip the mitre stays small.
        expect(grow).toBeLessThan(0.04);
      }
    }
  });

  it("draws every tooth as the same tall, straight-sided triangle, evenly spaced across tiles", () => {
    const run = around({ "1,0": "pocket", "-1,0": "pocket" });
    const outlines = [0, 1].flatMap((worldX) => toothOutlines(organicSideFront(NORTH, true, worldX, 0, run)));
    expect(outlines).toHaveLength(8);
    const heights = outlines.map(toothHeight);
    const widths = outlines.map((pts) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)));
    // All the same size (only the meander tilts them a hair)...
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.02);
    // ...and tall: well over twice as high as they are wide.
    for (let i = 0; i < heights.length; i += 1) expect(heights[i]! / widths[i]!).toBeGreaterThan(2);
    // Straight-sided: a triangle is just its two base corners and its tip.
    for (const pts of outlines) expect(new Set(pts.map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`)).size).toBe(3);
  });

  it("swells and thins the stroke along the front, like an inked line", () => {
    const widths = organicSideFront(NORTH, false, 7, 3, around({ "1,0": "pocket", "-1,0": "pocket" })).map((p) =>
      Math.hypot(p.points[0]!.x - p.points[3]!.x, p.points[0]!.y - p.points[3]!.y)
    );
    expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(1.15);
  });

  it("tapers the stroke to a point where the front meets the old border", () => {
    const kinds = around({ "1,0": "rival", "1,-1": "rival", "-1,0": "pocket" });
    const line = organicSideFront(NORTH, false, 0, 0, kinds).filter((p) => p.points.length === 4);
    const width = (p: (typeof line)[number], end: 0 | 1): number =>
      end === 0 ? Math.hypot(p.points[0]!.x - p.points[3]!.x, p.points[0]!.y - p.points[3]!.y) : Math.hypot(p.points[1]!.x - p.points[2]!.x, p.points[1]!.y - p.points[2]!.y);
    expect(width(line[line.length - 1]!, 1)).toBeLessThan(0.003); // at the border
    expect(width(line[0]!, 0)).toBeGreaterThan(0.02); // the other end runs on into the next tile at full width
  });

  it("puts teeth only where asked", () => {
    expect(teeth(organicSideFront(NORTH, false, 0, 0, around({})))).toHaveLength(0);
    expect(toothOutlines(organicSideFront(NORTH, true, 0, 0, around({})))).toHaveLength(4);
  });

  it("runs straight up to the old border and stops there, with no curl into the rival's own land", () => {
    // The rival pushed across a border at x = 0.5: their own land (outside my reach) is east of this pocket tile.
    // North side faces my land; its east end meets the old border.
    const kinds = around({ "1,0": "rival", "1,-1": "rival", "0,1": "pocket" });
    const pts = linePoints(organicSideFront(NORTH, true, 0, 0, kinds));
    // Reaches the corner instead of stopping a corner-radius short...
    expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThan(0.45);
    // ...and never bends down or across into the rival's land.
    expect(pts.filter((p) => p.x > 0.4).every((p) => p.y < -0.35)).toBe(true);
    expect(Math.max(...pts.map((p) => p.x))).toBeLessThan(0.62);
  });

  it("turns an inner corner square and drops the end tooth that would cross its neighbour's", () => {
    // The pocket continues north-west and west of the corner: north side's start is an inner corner.
    const kinds = around({ "-1,-1": "pocket", "-1,0": "pocket" });
    const pieces = organicSideFront(NORTH, true, 0, 0, kinds);
    // Still runs right to the corner (no curve out into my tile)...
    const line = linePoints(pieces);
    expect(Math.min(...line.map((p) => p.x))).toBeLessThan(-0.4);
    expect(Math.min(...line.map((p) => p.y))).toBeGreaterThan(-0.65);
    // ...and only 3 of the 4 teeth: the one at the inside corner is dropped.
    expect(toothOutlines(pieces)).toHaveLength(3);
  });

  it("keeps the tooth at an inner corner the side ends on: only the side starting there drops one", () => {
    // The pocket continues north-east and east: the north side's end is the inner corner, so the east side (starting there) drops its tooth instead.
    const kinds = around({ "1,-1": "pocket", "1,0": "pocket" });
    expect(toothOutlines(organicSideFront(NORTH, true, 0, 0, kinds))).toHaveLength(4);
  });

  it("treats a pocket tile touching only diagonally as an outer corner, not an inner one", () => {
    const capCount = (pieces: ReturnType<typeof organicSideFront>): number =>
      pieces.filter((p) => p.points.length === 4 && Math.hypot(p.points[0]!.x - p.points[2]!.x, p.points[0]!.y - p.points[2]!.y) < 0.1).length;
    const lone = organicSideFront(NORTH, true, 0, 0, around({}));
    const diagonal = organicSideFront(NORTH, true, 0, 0, around({ "-1,-1": "pocket" }));
    expect(capCount(diagonal)).toBe(capCount(lone));
    expect(toothOutlines(diagonal)).toHaveLength(4);
  });

  it("tapers into the old border when it lies diagonally across a straight run", () => {
    // The pocket continues west, but the rival's own land sits north-west: the front ends at the old border there.
    const kinds = around({ "-1,0": "pocket", "-1,-1": "rival" });
    const line = organicSideFront(NORTH, false, 0, 0, kinds).filter((p) => p.points.length === 4);
    expect(Math.hypot(line[0]!.points[0]!.x - line[0]!.points[3]!.x, line[0]!.points[0]!.y - line[0]!.points[3]!.y)).toBeLessThan(0.003);
  });
});
