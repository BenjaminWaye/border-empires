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

  it("draws teeth as shark fins: a root that flares along the line and concave flanks up to a sharp tip", () => {
    const fan = teeth(organicSideFront(NORTH, true, 0, 0, around({ "1,0": "pocket", "-1,0": "pocket" })));
    // One tooth = a fan of triangles about its root centre; take the middle tooth (u = 1/2).
    const middle = fan.filter((p) => Math.abs(p.points[0]!.x) < 0.1);
    const outline = middle.flatMap((p) => [p.points[1]!, p.points[2]!]);
    const tip = outline.reduce((a, b) => (b.y < a.y ? b : a));
    const root = outline.filter((p) => p.y > tip.y + 0.15);
    // Flared root: much wider than the tooth is near its tip.
    expect(Math.max(...root.map((p) => p.x)) - Math.min(...root.map((p) => p.x))).toBeGreaterThan(0.15);
    // Concave flank: halfway up, the flank is well inside the straight line from root corner to tip.
    const halfway = outline.filter((p) => p.x > tip.x && Math.abs(p.y - (tip.y + 0.09)) < 0.04);
    for (const p of halfway) expect(p.x - tip.x).toBeLessThan(0.05);
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

  it("puts teeth only where asked, and no corner tooth when the other side of the corner isn't mine", () => {
    expect(teeth(organicSideFront(NORTH, false, 0, 0, around({})))).toHaveLength(0);
    const westUnowned = organicSideFront(NORTH, true, 0, 0, around({ "-1,0": "other" }));
    expect(teeth(westUnowned).some((p) => p.points[2]!.x < -0.5 && p.points[2]!.y < -0.5)).toBe(false);
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

  it("curves round an inner corner through my tile instead of dropping into the pocket", () => {
    // The pocket continues north-west and west of the corner: north side's start is an inner corner.
    const kinds = around({ "-1,-1": "pocket", "-1,0": "pocket" });
    const pts = linePoints(organicSideFront(NORTH, true, 0, 0, kinds));
    // The curve bulges out into my tile to the north (y < -0.5) near the corner, not into the pocket.
    const nearCorner = pts.filter((p) => p.x < -0.3);
    expect(Math.min(...nearCorner.map((p) => p.y))).toBeLessThan(-0.6);
  });
});
