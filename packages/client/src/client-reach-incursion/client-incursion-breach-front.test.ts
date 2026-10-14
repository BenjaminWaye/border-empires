import { describe, expect, it } from "vitest";
import { organicSideFront, type BreachPoint, type FrontNeighbourKind, type FrontSide } from "./client-incursion-breach-front.js";

const NORTH: FrontSide = { dx: 0, dy: -1, a: { x: -0.5, y: -0.5 }, t: { x: 1, y: 0 } };

// The tile itself is the pocket; anything unlisted is my land.
const around =
  (overrides: Record<string, FrontNeighbourKind>) =>
  (dx: number, dy: number): FrontNeighbourKind =>
    overrides[`${dx},${dy}`] ?? (dx === 0 && dy === 0 ? "pocket" : "mine");

const linePoints = (pieces: ReturnType<typeof organicSideFront>): BreachPoint[] => pieces.filter((p) => p.points.length === 4).flatMap((p) => p.points);
const teeth = (pieces: ReturnType<typeof organicSideFront>) => pieces.filter((p) => p.points.length === 3);
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

  it("meanders off the tile grid rather than running dead straight", () => {
    const ys = linePoints(organicSideFront(NORTH, false, 3, 9, around({ "1,0": "pocket", "-1,0": "pocket" }))).map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.04);
    // ...but stays close to the boundary.
    for (const y of ys) expect(Math.abs(y + 0.5)).toBeLessThan(0.12);
  });

  it("rounds an outer corner: the line pulls in from the square corner and carries a tooth on the curve", () => {
    // A lone pocket tile: the north side starts at the north-west outer corner.
    const pieces = organicSideFront(NORTH, true, 0, 0, around({}));
    const nearestToCorner = Math.min(...linePoints(pieces).map((p) => Math.hypot(p.x + 0.5, p.y + 0.5)));
    expect(nearestToCorner).toBeGreaterThan(0.05);
    // 3 teeth on the straight stretch would include u = 1/6, inside the curve; it's replaced by one on the curve.
    const tips = teeth(pieces).map((p) => p.points[2]!);
    const diagonalTip = tips.find((p) => p.x < -0.5 && p.y < -0.5);
    expect(diagonalTip).toBeDefined();
  });

  it("puts teeth only where asked, and no corner tooth when the other side of the corner isn't mine", () => {
    expect(teeth(organicSideFront(NORTH, false, 0, 0, around({})))).toHaveLength(0);
    const westUnowned = organicSideFront(NORTH, true, 0, 0, around({ "-1,0": "other" }));
    expect(teeth(westUnowned).some((p) => p.points[2]!.x < -0.5 && p.points[2]!.y < -0.5)).toBe(false);
  });

  it("curves round an inner corner through my tile instead of dropping into the pocket", () => {
    // The pocket continues north-west and west of the corner: north side's start is an inner corner.
    const kinds = around({ "-1,-1": "pocket", "-1,0": "pocket" });
    const pts = linePoints(organicSideFront(NORTH, true, 0, 0, kinds));
    // The curve bulges out into my tile to the north (y < -0.5) near the corner, not into the pocket.
    const nearCorner = pts.filter((p) => p.x < -0.3);
    expect(Math.min(...nearCorner.map((p) => p.y))).toBeLessThan(-0.6);
  });
});
