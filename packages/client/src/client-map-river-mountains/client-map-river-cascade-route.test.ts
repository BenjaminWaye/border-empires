import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, type RiverHead } from "@border-empires/shared";
import { cascadeRoute, cascadeStreamTreeFilter } from "./client-map-river-cascade-route.js";
import { riverMountainFaceOf } from "./client-map-river-mountains.js";

const head = (x: number, y: number, mountain: { x: number; y: number }): RiverHead => ({ corner: { x, y }, heading: { dx: 0, dy: 1 }, mountain });

describe("river cascade route", () => {
  it("falls toward a south exit corner, down the face the camera sees", () => {
    // Mountain (10, 8); head (10, 10) is one edge below its south-west corner (10, 9).
    const route = cascadeRoute(riverMountainFaceOf(head(10, 10, { x: 10, y: 8 }))!);
    expect(route.dirX).toBeCloseTo(-Math.SQRT1_2);
    expect(route.dirY).toBeCloseTo(Math.SQRT1_2);
    expect(route.headX).toBe(10);
    expect(route.headY).toBe(10);
  });

  it("turns a north exit's fall toward the camera (south) instead of down the hidden far side", () => {
    // Mountain (10, 8); head (9, 8) is one edge west of its north-west corner (10, 8).
    const route = cascadeRoute(riverMountainFaceOf(head(9, 8, { x: 10, y: 8 }))!);
    expect(route.dirX).toBeLessThan(0);
    expect(route.dirY).toBeGreaterThan(0);
    expect(route.footY).toBeGreaterThan(8.5);
  });

  it("keeps trees off the stream from the foot to the pool, and only near it", () => {
    const heads = new Map([[8 * WORLD_WIDTH + 9, head(9, 8, { x: 10, y: 8 })]]);
    const route = cascadeRoute(riverMountainFaceOf(head(9, 8, { x: 10, y: 8 }))!);
    // Midway along the stream, in whichever tile that lands.
    const mx = (route.footX + route.headX) / 2;
    const my = (route.footY + route.headY) / 2;
    const tx = Math.floor(mx);
    const ty = Math.floor(my);
    const onStream = cascadeStreamTreeFilter(tx, ty, heads)!;
    expect(onStream(mx - tx - 0.5, my - ty - 0.5)).toBe(true);
    expect(cascadeStreamTreeFilter(tx + 20, ty + 20, heads)).toBeNull();
  });
});
