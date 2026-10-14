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
      roundedCorners: 0,
      band: [],
      veilSides: []
    });
  });

  it("keeps the strip on sides facing land that isn't mine, whatever the style", () => {
    for (const style of ["ember", "ink", "veil"] as const) {
      expect(incursionBreachLayout(style, kinds).straightEdges).toEqual({ north: false, east: false, south: true, west: false });
    }
  });

  it("replaces the strip with the front line all round for spikes, with teeth only on the sides facing my land", () => {
    const layout = incursionBreachLayout("spikes", kinds, 10, 20);
    expect(layout.straightEdges).toEqual({ north: false, east: false, south: false, west: false });
    const toothTips = layout.front.filter((piece) => piece.points.length === 3).map((piece) => piece.points[2]!);
    // Teeth reach out past the north and west sides (mine) but never past the unowned south side.
    expect(toothTips.some((p) => p.y < -0.6)).toBe(true);
    expect(toothTips.some((p) => p.x < -0.6)).toBe(true);
    expect(toothTips.some((p) => p.y > 0.6)).toBe(false);
    // The line runs along all three open sides, including the unowned south one.
    const lineYs = layout.front.filter((piece) => piece.points.length === 4).flatMap((piece) => piece.points.map((p) => p.y));
    expect(Math.max(...lineYs)).toBeGreaterThan(0.35);
  });

  it("marks the outer corners the spikes line rounds off, so the hatch can match", () => {
    // Open north, south and west; the pocket continues east: outer corners at NW and SW only.
    expect(incursionBreachLayout("spikes", kinds).roundedCorners).toBe(0b1001);
    // A lone pocket tile rounds all four.
    expect(incursionBreachLayout("spikes", around({})).roundedCorners).toBe(0b1111);
    expect(incursionBreachLayout("straight", around({})).roundedCorners).toBe(0);
  });

  it("draws no edge at all along the old border with the rival's own land", () => {
    const atBorder = around({ "1,0": "rival", "1,-1": "rival", "1,1": "rival" });
    expect(incursionBreachLayout("straight", atBorder).straightEdges.east).toBe(false);
    // Spikes: the east side gets no line, and no outer-corner rounding on that side.
    expect(incursionBreachLayout("spikes", atBorder).roundedCorners & 0b0110).toBe(0);
    expect(incursionBreachLayout("spikes", atBorder).front.some((piece) => piece.points.some((p) => p.x > 0.6))).toBe(false);
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
