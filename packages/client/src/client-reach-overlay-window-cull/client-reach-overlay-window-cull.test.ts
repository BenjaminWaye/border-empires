import { describe, expect, it } from "vitest";
import { allocateFairlyByOwner, cullPylonsToWindow, cullSegmentsToWindow, type CullWindow, type WindowCullDeps } from "./client-reach-overlay-window-cull.js";

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
    const items = [{ x: 998, y: 5, tag: "wraps-to-near" }]; // toroidDelta(5, 998, 1000) = -7... actually check below
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

describe("allocateFairlyByOwner", () => {
  it("passes through unchanged when under the cap", () => {
    const items = [{ ownerId: "me", v: 1 }, { ownerId: "rival", v: 2 }];
    expect(allocateFairlyByOwner(items, 10)).toEqual(items);
  });

  it("round-robins across owners instead of starving a later owner entirely -- the actual bug: a rival's border never rendered when the local player's own pylons alone reached the cap", () => {
    const mine = Array.from({ length: 8 }, (_, i) => ({ ownerId: "me", v: i }));
    const rival = Array.from({ length: 8 }, (_, i) => ({ ownerId: "rival", v: i }));
    const result = allocateFairlyByOwner([...mine, ...rival], 6);
    expect(result).toHaveLength(6);
    expect(result.filter((r) => r.ownerId === "rival").length).toBeGreaterThan(0);
    expect(result.filter((r) => r.ownerId === "me").length).toBeGreaterThan(0);
    // Round-robin with a 6-item cap and two owners: 3 each.
    expect(result.filter((r) => r.ownerId === "me")).toHaveLength(3);
    expect(result.filter((r) => r.ownerId === "rival")).toHaveLength(3);
  });

  it("preserves each owner's own item order (mandatory corners sampled first stay first)", () => {
    const mine = Array.from({ length: 5 }, (_, i) => ({ ownerId: "me", v: i }));
    const result = allocateFairlyByOwner(mine, 3);
    expect(result.map((r) => r.v)).toEqual([0, 1, 2]);
  });

  it("gives a small owner's full allocation and redistributes the rest to a bigger owner", () => {
    const small = [{ ownerId: "rival-b", v: 0 }];
    const big = Array.from({ length: 10 }, (_, i) => ({ ownerId: "rival-a", v: i }));
    const result = allocateFairlyByOwner([...big, ...small], 4);
    expect(result.filter((r) => r.ownerId === "rival-b")).toHaveLength(1);
    expect(result.filter((r) => r.ownerId === "rival-a")).toHaveLength(3);
  });
});
