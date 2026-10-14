import { describe, expect, it } from "vitest";
import { breachShapeTriangleCount, incursionBreachOutline, type BreachNeighbourKind, type BreachShape } from "./client-incursion-breach-shapes.js";
import { INCURSION_BREACH_STYLES } from "./client-incursion-breach-style.js";

// A neighbourhood map keyed by "dx,dy"; anything unlisted is "mine".
const around =
  (overrides: Record<string, BreachNeighbourKind>) =>
  (dx: number, dy: number): BreachNeighbourKind =>
    overrides[`${dx},${dy}`] ?? "mine";

const maxReach = (shapes: readonly BreachShape[], axis: "x" | "y", sign: 1 | -1): number =>
  Math.max(...shapes.flatMap((shape) => shape.points.map((p) => p[axis] * sign)));

describe("incursionBreachOutline", () => {
  it("keeps every open side as a plain strip in the straight style", () => {
    const outline = incursionBreachOutline("straight", 10, 20, around({ "1,0": "pocket", "0,1": "other" }));
    expect(outline.straightEdges).toEqual({ north: true, east: false, south: true, west: true });
    expect(outline.shapes).toHaveLength(0);
  });

  it.each(["spikes", "jagged", "shattered"] as const)("%s: breaches only the sides that face my land", (style) => {
    // East continues the pocket, south borders unowned land, north + west border me.
    const outline = incursionBreachOutline(style, 10, 20, around({ "1,0": "pocket", "0,1": "other" }));
    expect(outline.straightEdges).toEqual({ north: false, east: false, south: true, west: false });
    expect(outline.shapes.length).toBeGreaterThan(0);
    // Nothing reaches into the pocket side (east) or the unowned side (south)
    // beyond the line's own thickness at the tile corners (spike tips and
    // cracks reach 0.25+ into the tiles they do face).
    expect(maxReach(outline.shapes, "x", 1)).toBeLessThan(0.55);
    expect(maxReach(outline.shapes, "y", 1)).toBeLessThan(0.55);
  });

  it("draws spikes as a front line: an outline plus evenly spaced teeth pointing into my tile", () => {
    const outline = incursionBreachOutline("spikes", 3, 4, around({ "0,1": "other", "1,0": "other", "-1,0": "other" }));
    const teeth = outline.shapes.filter((shape) => shape.points.length === 3);
    expect(teeth).toHaveLength(4);
    // North side: every tooth tip points out of the tile, into my neighbouring tile.
    for (const tooth of teeth) expect(Math.min(...tooth.points.map((p) => p.y))).toBeLessThan(-0.6);
    // Regular, not random: teeth sit on even spacing and are identical for any tile.
    const tipXs = teeth.map((tooth) => tooth.points[2]!.x);
    expect(tipXs.map((x, i) => (i === 0 ? 0 : x - tipXs[i - 1]!)).slice(1).every((gap) => Math.abs(gap - 0.25) < 1e-9)).toBe(true);
    expect(incursionBreachOutline("spikes", 50, 60, around({ "0,1": "other", "1,0": "other", "-1,0": "other" }))).toEqual(outline);
  });

  it("drops the spike at an inside corner, where the neighbouring pocket side's spike points into the same tile", () => {
    // Pocket continues east and north-east: the tile north of me is bordered
    // by the pocket on two sides, so our north side's east-end spike goes.
    const kinds = { "0,1": "other", "1,0": "pocket", "-1,0": "other", "1,-1": "pocket" } as const;
    const teeth = incursionBreachOutline("spikes", 3, 4, around(kinds)).shapes.filter((shape) => shape.points.length === 3);
    expect(teeth).toHaveLength(3);
    expect(Math.max(...teeth.map((tooth) => tooth.points[2]!.x))).toBeLessThan(0.3);
  });

  it("is stable for the same world tile; the jagged and shattered looks vary between tiles", () => {
    const kinds = around({});
    for (const style of ["jagged", "shattered"] as const) {
      expect(incursionBreachOutline(style, 7, 9, kinds)).toEqual(incursionBreachOutline(style, 7, 9, kinds));
      expect(incursionBreachOutline(style, 7, 9, kinds)).not.toEqual(incursionBreachOutline(style, 8, 9, kinds));
    }
  });

  it("stays within a small triangle budget even with all four sides breached", () => {
    for (const style of INCURSION_BREACH_STYLES) {
      const shapes = incursionBreachOutline(style, 1, 1, around({})).shapes;
      expect(shapes.every((shape) => shape.points.length >= 3)).toBe(true);
      expect(breachShapeTriangleCount(shapes)).toBeLessThanOrEqual(220);
    }
  });
});
