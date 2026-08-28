import { describe, expect, it } from "vitest";

import { DOCK_REACH_RADIUS, OUTPOST_REACH_RADIUS, TOWN_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { chebyshevWithWrap, reachRadiusForAnchor, reachRadiusForKind, tileKey, tileKeysInReach } from "./reach-geometry.js";
import type { ReachAnchor } from "./reach-geometry.js";

// Split out of reach.test.ts to keep that file under the 500-line cap —
// covers the pure geometry helpers in reach-geometry.ts.

describe("reachRadiusForKind", () => {
  it("TOWN → TOWN_REACH_RADIUS", () => {
    expect(reachRadiusForKind("TOWN")).toBe(TOWN_REACH_RADIUS);
  });
  it("OUTPOST → OUTPOST_REACH_RADIUS", () => {
    expect(reachRadiusForKind("OUTPOST")).toBe(OUTPOST_REACH_RADIUS);
  });
  it("DOCK → DOCK_REACH_RADIUS", () => {
    expect(reachRadiusForKind("DOCK")).toBe(DOCK_REACH_RADIUS);
  });
});

describe("reachRadiusForAnchor", () => {
  it("falls back to reachRadiusForKind when no override is set", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    expect(reachRadiusForAnchor(anchor)).toBe(OUTPOST_REACH_RADIUS);
  });

  it("uses radiusOverride when set, regardless of kind", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST", radiusOverride: 3 };
    expect(reachRadiusForAnchor(anchor)).toBe(3);
    expect(tileKeysInReach(anchor).length).toBe((2 * 3 + 1) ** 2);
  });
});

describe("tileKeysInReach", () => {
  it("produces (2r+1)^2 tiles for a radius-r anchor", () => {
    const anchor: ReachAnchor = { x: 100, y: 100, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const keys = tileKeysInReach(anchor);
    expect(keys.length).toBe((2 * TOWN_REACH_RADIUS + 1) ** 2);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes the anchor's own tile", () => {
    const anchor: ReachAnchor = { x: 10, y: 20, ownerId: "p1", activatedAt: 1, kind: "DOCK" };
    expect(tileKeysInReach(anchor)).toContain(tileKey(10, 20));
  });

  it("wraps around world edges", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "TOWN" };
    const keys = new Set(tileKeysInReach(anchor));
    expect(keys.has(tileKey(WORLD_WIDTH - 1, WORLD_HEIGHT - 1))).toBe(true);
    expect(keys.has(tileKey(WORLD_WIDTH - 1, 0))).toBe(true);
  });
});

describe("tileKeysInReach with land-gating", () => {
  // A radius-5 OUTPOST anchor at (0,0) with a strip of SEA at x=2 splitting
  // land at x=0..1 from land at x=3..10 on the same row.
  const isLandExceptStrip = (x: number, _y: number): boolean => x !== 2;

  it("does not cross a water strip to reach land on the far side within radius", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const keys = new Set(tileKeysInReach(anchor, isLandExceptStrip));
    // (3,0) is LAND, within the radius-5 disk, but only reachable by
    // stepping across the water strip at x=2 -- must NOT be included.
    expect(keys.has(tileKey(3, 0))).toBe(false);
    expect(keys.has(tileKey(4, 0))).toBe(false);
  });

  it("still includes a water tile directly adjacent to reached land (coastal edge)", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const keys = new Set(tileKeysInReach(anchor, isLandExceptStrip));
    // (1,0) is LAND and land-connected to the anchor; (2,0) is the water
    // strip directly adjacent to it -- included as a coastal edge tile, even
    // though it can't itself propagate reach any further.
    expect(keys.has(tileKey(1, 0))).toBe(true);
    expect(keys.has(tileKey(2, 0))).toBe(true);
  });

  it("crossesWater anchors ignore land-gating entirely", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST", crossesWater: true };
    const keys = new Set(tileKeysInReach(anchor, isLandExceptStrip));
    expect(keys.has(tileKey(3, 0))).toBe(true);
    expect(keys.has(tileKey(2, 0))).toBe(true);
  });

  it("without a landConnectivity query stays purely geometric (back-compat)", () => {
    const anchor: ReachAnchor = { x: 0, y: 0, ownerId: "p1", activatedAt: 1, kind: "OUTPOST" };
    const keys = new Set(tileKeysInReach(anchor));
    expect(keys.has(tileKey(3, 0))).toBe(true);
  });
});

describe("chebyshevWithWrap", () => {
  it("wraps around world edges to give a short distance", () => {
    expect(chebyshevWithWrap(0, 0, WORLD_WIDTH - 1, 0)).toBe(1);
  });
});
