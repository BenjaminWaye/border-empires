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
  it("has no second peak, so the spring at its foot stays clear", () => {
    for (let i = 0; i < 40; i += 1) expect(mountainPeaksLayout(i, i * 2, LONE, { riverMountain: true }).peaks).toHaveLength(1);
  });

  it("wells up at the main peak's foot (not on its face) and runs to the corner nearest the river head", () => {
    // Mountain (10, 8), head (10, 10): exit corner (10, 9) is the tile's bottom-left corner.
    const face = riverMountainFaceOf({ corner: { x: 10, y: 10 }, heading: { dx: 0, dy: 1 }, mountain: { x: 10, y: 8 } })!;
    const main = mountainPeaksLayout(10, 8, LONE, { riverMountain: true }).peaks[0]!;
    const stream = riverMountainStream(face, 10, 8, main);
    expect(stream.exit).toEqual({ x: 0, y: 1 });
    // At or below the peak's base line, on its left (river) side.
    expect(stream.source.y).toBeGreaterThanOrEqual(main.baseLeft.y);
    expect(stream.source.x).toBeLessThan(main.apex.x);
    expect(stream.path[0]).toEqual(stream.source);
    expect(stream.path.at(-1)).toEqual(stream.exit);
  });

  it("goes round the tile's side, never over the peak, for a corner on the far (north) side", () => {
    // Mountain (10, 8), head (9, 8): exit corner (10, 8) is the tile's top-left corner.
    const face = riverMountainFaceOf({ corner: { x: 9, y: 8 }, heading: { dx: -1, dy: 0 }, mountain: { x: 10, y: 8 } })!;
    const main = mountainPeaksLayout(10, 8, LONE, { riverMountain: true }).peaks[0]!;
    const stream = riverMountainStream(face, 10, 8, main);
    expect(stream.exit).toEqual({ x: 0, y: 0 });
    expect(stream.source.y).toBeGreaterThanOrEqual(main.baseLeft.y);
    // Everything after the spring stays left of the peak's base.
    for (const p of stream.path.slice(1)) expect(p.x).toBeLessThan(main.baseLeft.x);
  });

  it("the two land tiles beside the cascade's edge each draw their half of the stream", () => {
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
