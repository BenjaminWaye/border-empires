import { describe, expect, it } from "vitest";
import {
  allocateByProximity,
  cullAndAllocatePylons,
  cullAndAllocateSegments,
  cullPylonsToWindow,
  cullSegmentsToWindow,
  type CullWindow,
  type WindowCullDeps
} from "./client-reach-overlay-window-cull.js";

const deps: WindowCullDeps = {
  toroidDelta: (from, to, dim) => {
    let delta = to - from;
    if (delta > dim / 2) delta -= dim;
    if (delta < -dim / 2) delta += dim;
    return delta;
  },
  worldWidth: 1000,
  worldHeight: 1000
};

const window: CullWindow = { camX: 100, camY: 100, halfW: 10, halfH: 10 };

describe("cullPylonsToWindow", () => {
  it("keeps points inside the window plus margin, drops points well outside it", () => {
    const items = [
      { x: 100, y: 100, tag: "center" },
      { x: 113, y: 100, tag: "just-inside-margin" }, // halfW(10) + margin(4) = 14
      { x: 200, y: 200, tag: "far-away" }
    ];
    const result = cullPylonsToWindow(items, window, deps);
    expect(result.map((r) => r.tag)).toEqual(["center", "just-inside-margin"]);
  });

  it("wraps around the toroidal world instead of always culling near the seam", () => {
    const wrapWindow: CullWindow = { camX: 5, camY: 5, halfW: 3, halfH: 3 };
    const items = [{ x: 998, y: 5, tag: "wraps-to-near" }];
    const result = cullPylonsToWindow(items, wrapWindow, deps, 10);
    expect(result).toHaveLength(1);
  });
});

describe("cullSegmentsToWindow", () => {
  it("keeps a segment when only one endpoint is inside the window", () => {
    const items = [{ from: { x: 100, y: 100 }, to: { x: 500, y: 500 }, tag: "crosses-edge" }];
    const result = cullSegmentsToWindow(items, window, deps);
    expect(result.map((r) => r.tag)).toEqual(["crosses-edge"]);
  });

  it("drops a segment with both endpoints outside the window", () => {
    const items = [{ from: { x: 500, y: 500 }, to: { x: 600, y: 600 }, tag: "far" }];
    expect(cullSegmentsToWindow(items, window, deps)).toEqual([]);
  });
});

describe("allocateByProximity", () => {
  it("passes through unchanged when under the cap", () => {
    const items = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(allocateByProximity(items, { x: 0, y: 0 }, (i) => i, deps, 10)).toEqual(items);
  });

  it("keeps the items closest to center and drops the farthest, regardless of owner", () => {
    // Mixed owners at varying distance from center (0,0) -- proximity alone decides survival.
    const items = [
      { x: 1, y: 0, ownerId: "far-owner" },
      { x: 50, y: 0, ownerId: "far-owner" },
      { x: 2, y: 0, ownerId: "near-owner" },
      { x: 3, y: 0, ownerId: "near-owner" }
    ];
    const result = allocateByProximity(items, { x: 0, y: 0 }, (i) => i, deps, 3);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.x).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(result.some((r) => r.x === 50)).toBe(false);
  });

  it("a rival right next to the camera is never starved by a distant owner with many items", () => {
    // Regression for the actual bug: 10 far-away items from "me" should not
    // crowd out one nearby rival item once the cap forces a choice.
    const mine = Array.from({ length: 10 }, (_, i) => ({ x: 500 + i, y: 0, ownerId: "me" }));
    const rivalNearby = { x: 1, y: 0, ownerId: "rival" };
    const result = allocateByProximity([...mine, rivalNearby], { x: 0, y: 0 }, (i) => i, deps, 1);
    expect(result).toEqual([rivalNearby]);
  });
});

describe("cullAndAllocatePylons / cullAndAllocateSegments", () => {
  it("culls to the window first, then keeps only the nearest-to-center survivors under the cap", () => {
    const items = [
      { x: 100, y: 100, ownerId: "me" }, // dead center, kept
      { x: 105, y: 100, ownerId: "rival" }, // close, kept
      { x: 108, y: 100, ownerId: "me" }, // farther but still in-window
      { x: 500, y: 500, ownerId: "me" } // outside window entirely, culled first
    ];
    const result = cullAndAllocatePylons(items, window, deps, 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => `${r.x},${r.y}`)).toEqual(["100,100", "105,100"]);
  });

  it("returns everything unchanged (no culling) when window is undefined -- pre-first-rebuild fallback", () => {
    const items = [{ x: 500, y: 500, ownerId: "me" }];
    expect(cullAndAllocatePylons(items, undefined, deps, 1)).toEqual(items);
  });

  it("segments: prioritizes by the nearer of the two endpoints", () => {
    const items = [
      { from: { x: 100, y: 100 }, to: { x: 300, y: 300 }, ownerId: "me" }, // near endpoint at center
      { from: { x: 106, y: 100 }, to: { x: 107, y: 100 }, ownerId: "rival" }, // both endpoints close
      { from: { x: 500, y: 500 }, to: { x: 600, y: 600 }, ownerId: "me" } // both outside window
    ];
    const result = cullAndAllocateSegments(items, window, deps, 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.ownerId).toBe("me");
  });
});
