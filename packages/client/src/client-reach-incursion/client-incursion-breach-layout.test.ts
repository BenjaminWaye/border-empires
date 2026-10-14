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
      teeth: [],
      band: [],
      veilSides: []
    });
  });

  it("keeps the strip on sides facing land that isn't mine, whatever the style", () => {
    for (const style of ["ember", "ink", "veil"] as const) {
      expect(incursionBreachLayout(style, kinds).straightEdges).toEqual({ north: false, east: false, south: true, west: false });
    }
  });

  it("keeps the strip as the front line for spikes and stands evenly spaced teeth on the sides facing my land", () => {
    const layout = incursionBreachLayout("spikes", kinds);
    expect(layout.straightEdges).toEqual({ north: true, east: false, south: true, west: true });
    // North and west sides face my land, four teeth each.
    expect(layout.teeth).toHaveLength(8);
    const northTips = layout.teeth.map((t) => t.fill[2]).filter((p) => p.y < -0.5);
    expect(northTips).toHaveLength(4);
    for (const tip of northTips) expect(tip.y).toBeCloseTo(-0.7);
    expect(northTips.map((p) => p.x)).toEqual([-0.375, -0.125, 0.125, 0.375]);
    // Each outline is a larger copy of its fill, so it shows as a rim round it.
    for (const tooth of layout.teeth) {
      const span = (pts: readonly { x: number; y: number }[]): number => Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
      expect(span(tooth.outline)).toBeGreaterThan(span(tooth.fill));
    }
  });

  it("drops the spike at an inside corner, where the neighbouring pocket side's spike points into the same tile", () => {
    // The pocket also continues north-east, so the tile north of us is bordered by the pocket on two sides.
    const corner = around({ "1,0": "pocket", "1,-1": "pocket", "0,1": "other", "-1,0": "other" });
    const tips = incursionBreachLayout("spikes", corner).teeth.map((t) => t.fill[2]);
    expect(tips).toHaveLength(3);
    expect(Math.max(...tips.map((p) => p.x))).toBeLessThan(0.3);
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
