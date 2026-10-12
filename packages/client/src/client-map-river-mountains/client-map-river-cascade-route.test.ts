import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, type RiverHead } from "@border-empires/shared";
import { cascadeRoute, cascadeStreamTreeFilter } from "./client-map-river-cascade-route.js";
import { riverMountainFaceOf } from "./client-map-river-mountains.js";

const head = (x: number, y: number, mountain: { x: number; y: number }): RiverHead => ({ corner: { x, y }, heading: { dx: 0, dy: 1 }, mountain });

describe("river cascade route", () => {
  it("springs from the mountain's base on the side facing the river head", () => {
    // Mountain (10, 8), centre (10.5, 8.5); head (10, 10) is down and to the left.
    const route = cascadeRoute(riverMountainFaceOf(head(10, 10, { x: 10, y: 8 }))!);
    expect(route.headX).toBe(10);
    expect(route.headY).toBe(10);
    expect(route.dirX).toBeCloseTo(-0.5 / Math.hypot(0.5, 1.5));
    expect(route.dirY).toBeCloseTo(1.5 / Math.hypot(0.5, 1.5));
    // The spring sits between the mountain and the head.
    expect(Math.hypot(route.footX - 10.5, route.footY - 8.5)).toBeLessThan(Math.hypot(10 - 10.5, 10 - 8.5));
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
