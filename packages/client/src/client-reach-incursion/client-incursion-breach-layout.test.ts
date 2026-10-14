import { describe, expect, it } from "vitest";
import { NEIGHBOUR_OFFSETS, incursionBreachLayout, type BreachNeighbourKind } from "./client-incursion-breach-layout.js";

// A neighbourhood keyed by "dx,dy"; the tile itself is the pocket, anything unlisted is my land.
const around =
  (overrides: Record<string, BreachNeighbourKind>) =>
  (dx: number, dy: number): BreachNeighbourKind =>
    overrides[`${dx},${dy}`] ?? (dx === 0 && dy === 0 ? "pocket" : "mine");

const bit = (dx: number, dy: number): number => 1 << NEIGHBOUR_OFFSETS.findIndex(([ox, oy]) => ox === dx && oy === dy);

// The pocket continues east; south is unowned; everything else is mine.
const kinds = around({ "1,0": "pocket", "0,1": "other" });

describe("incursionBreachLayout", () => {
  it("keeps every open side as a plain strip in the straight style", () => {
    expect(incursionBreachLayout("straight", kinds)).toEqual({
      straightEdges: { north: true, east: false, south: true, west: true },
      front: [],
      band: [],
      veilSides: []
    });
  });

  it("keeps the strip on sides facing land that isn't mine, whatever the style", () => {
    for (const style of ["ember", "ink", "veil"] as const) {
      expect(incursionBreachLayout(style, kinds).straightEdges).toEqual({ north: false, east: false, south: true, west: false });
    }
  });

  it("replaces the strip with a thin front line all round for spikes, with teeth only on the sides facing my land", () => {
    const layout = incursionBreachLayout("spikes", kinds);
    expect(layout.straightEdges).toEqual({ north: false, east: false, south: false, west: false });
    const lines = layout.front.filter((piece) => piece.points.length === 4);
    const toothHalves = layout.front.filter((piece) => piece.points.length === 3);
    // North, south and west are open (east continues the pocket): a line on each.
    expect(lines).toHaveLength(3);
    // Thin: much thinner than the 0.07-tile strip it replaces.
    const north = lines.find((piece) => piece.points.every((p) => Math.abs(p.y + 0.5) < 0.05))!;
    const thickness = Math.max(...north.points.map((p) => p.y)) - Math.min(...north.points.map((p) => p.y));
    expect(thickness).toBeLessThan(0.05);
    // North and west face my land: 3 teeth each, as two halves; the unowned south side gets none.
    expect(toothHalves).toHaveLength(12);
    const northTips = toothHalves.filter((piece) => piece.points[2]!.y < -0.6).map((piece) => piece.points[2]!);
    expect(new Set(northTips.map((p) => p.x.toFixed(4)))).toEqual(new Set(["-0.3333", "0.0000", "0.3333"]));
    expect(toothHalves.some((piece) => piece.points[2]!.y > 0.5)).toBe(false);
  });

  it("shades one half of each tooth, consistently against a north-west light", () => {
    const halves = incursionBreachLayout("spikes", kinds).front.filter((piece) => piece.points.length === 3);
    for (let i = 0; i < halves.length; i += 2) expect([halves[i]!.shade, halves[i + 1]!.shade].sort()).toEqual([0.72, 1]);
    // North side: the west (light-facing) half is lit.
    const northWestHalf = halves.find((piece) => piece.points[2]!.y < -0.6 && piece.points[0]!.x < piece.points[2]!.x)!;
    expect(northWestHalf.shade).toBe(1);
  });

  it("drops the spike at an inside corner, where the neighbouring pocket side's spike points into the same tile", () => {
    // The pocket also continues north-east, so the tile north of us is bordered by the pocket on two sides.
    const corner = around({ "1,0": "pocket", "1,-1": "pocket", "0,1": "other", "-1,0": "other" });
    const tips = incursionBreachLayout("spikes", corner).front.filter((piece) => piece.points.length === 3).map((piece) => piece.points[2]!);
    expect(tips).toHaveLength(4); // 2 teeth x 2 halves
    expect(Math.max(...tips.map((p) => p.x))).toBeLessThan(0.1);
  });

  it("raises the veil only on the sides facing my land", () => {
    expect(incursionBreachLayout("veil", kinds).veilSides).toEqual(["north", "west"]);
    expect(incursionBreachLayout("veil", kinds).band).toEqual([]);
  });

  it("bands every tile of mine around the pocket tile, each masked to the pocket squares next to it", () => {
    const { band } = incursionBreachLayout("ember", kinds);
    // The pocket tile itself, measuring to my squares (not the pocket to the east or unowned to the south).
    expect(band[0]).toEqual({ dx: 0, dy: 0, side: -1, mask: 0xff & ~bit(1, 0) & ~bit(0, 1) });
    const north = band.find((t) => t.dx === 0 && t.dy === -1)!;
    // North of the seam: the pocket tile is south of it, the pocket's east tile is south-east.
    expect(north).toEqual({ dx: 0, dy: -1, side: 1, mask: bit(0, 1) | bit(1, 1) });
    // Unowned (0,1) and the pocket's own east tile (1,0) are not band tiles.
    expect(band.some((t) => (t.dx === 0 && t.dy === 1) || (t.dx === 1 && t.dy === 0))).toBe(false);
  });

  it("only stains my side for ink", () => {
    const { band } = incursionBreachLayout("ink", kinds);
    expect(band.length).toBeGreaterThan(0);
    expect(band.every((t) => t.side === 1)).toBe(true);
  });

  it("has no band when no tile of mine touches the pocket tile", () => {
    const enclosed = (dx: number, dy: number): BreachNeighbourKind => (dx === 0 && dy === 0 ? "pocket" : "other");
    expect(incursionBreachLayout("ember", enclosed).band).toEqual([]);
  });
});
