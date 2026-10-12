import { describe, expect, it } from "vitest";
import { riverEdgeKeyBetween } from "@border-empires/shared";
import { riverMountainFaceOf } from "../client-map-river-mountains/client-map-river-mountains.js";
import { mountainPeaksLayout } from "./client-map-render-mountain-peaks.js";
import { riverMountainStream } from "./client-map-render-river-mountain.js";
import { drawCascadeEdges } from "./client-map-render-river-edges.js";

const LONE = { north: false, east: false, south: false, west: false, cold: false };

const fillCountingContext = (): { ctx: CanvasRenderingContext2D; fills: () => number } => {
  let n = 0;
  const ctx = { fillStyle: "", fillRect: () => (n += 1) } as unknown as CanvasRenderingContext2D;
  return { ctx, fills: () => n };
};

describe("2D river mountain", () => {
  it("has no second peak, so the stream stays clear", () => {
    for (let i = 0; i < 40; i += 1) expect(mountainPeaksLayout(i, i * 2, LONE, true).peaks).toHaveLength(1);
  });

  it("runs its stream from the peak down to the mountain's corner nearest the river head", () => {
    // Mountain (10, 8), head (10, 10): exit corner (10, 9) is the tile's bottom-left corner.
    const face = riverMountainFaceOf({ corner: { x: 10, y: 10 }, heading: { dx: 0, dy: 1 }, mountain: { x: 10, y: 8 } })!;
    const main = mountainPeaksLayout(10, 8, LONE, true).peaks[0]!;
    const stream = riverMountainStream(face, 10, 8, main);
    expect(stream.exit).toEqual({ x: 0, y: 1 });
    expect(stream.source.y).toBeGreaterThan(main.apex.y);
    expect(stream.source.y).toBeLessThan(main.baseLeft.y);
    expect(stream.foot.x).toBeLessThan(stream.source.x); // heads toward the left corner
  });

  it("the two land tiles beside the cascade's edge each draw their half of the rapids", () => {
    const cascades = new Set([riverEdgeKeyBetween(10, 9, 10, 10)]); // vertical edge x = 10, y 9..10
    const left = fillCountingContext();
    drawCascadeEdges(left.ctx, 9, 9, 0, 0, 40, 40, cascades);
    const right = fillCountingContext();
    drawCascadeEdges(right.ctx, 10, 9, 0, 0, 40, 40, cascades);
    const other = fillCountingContext();
    drawCascadeEdges(other.ctx, 12, 9, 0, 0, 40, 40, cascades);
    expect(left.fills()).toBe(2);
    expect(right.fills()).toBe(2);
    expect(other.fills()).toBe(0);
  });
});
