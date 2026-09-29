import { describe, expect, it } from "vitest";
import { riverEdgeKey, riverEdgeKeyBetween, WORLD_WIDTH } from "@border-empires/shared";
import { tileRiverEdges } from "./client-map-render-river-edges.js";

describe("2D river edges (v9)", () => {
  it("both tiles sharing a river edge draw their half of it, on facing sides", () => {
    // A river along the vertical border between tile (4, 7) and tile (5, 7).
    const edges = new Set([riverEdgeKeyBetween(5, 7, 5, 8)]);
    expect(tileRiverEdges(4, 7, edges)).toEqual({ top: false, right: true, bottom: false, left: false });
    expect(tileRiverEdges(5, 7, edges)).toEqual({ top: false, right: false, bottom: false, left: true });
  });

  it("a horizontal river edge is the bottom of the tile above and the top of the tile below", () => {
    const edges = new Set([riverEdgeKey(3, 10, "H")]);
    expect(tileRiverEdges(3, 9, edges).bottom).toBe(true);
    expect(tileRiverEdges(3, 10, edges).top).toBe(true);
    expect(tileRiverEdges(4, 10, edges).top).toBe(false);
  });

  it("wraps at the world's east/west seam", () => {
    const edges = new Set([riverEdgeKey(0, 2, "V")]); // border between x = WORLD_WIDTH - 1 and x = 0
    expect(tileRiverEdges(WORLD_WIDTH - 1, 2, edges).right).toBe(true);
    expect(tileRiverEdges(0, 2, edges).left).toBe(true);
  });
});
