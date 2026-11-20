import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { SCOUT_ROUTE_BEAD_SPACING, SCOUT_ROUTE_MAX_BEADS } from "./client-map-3d-scout-drone-ground-fx.js";

// Review of #2895: with the range limit gone, a 480-bead cap stopped the 3D route ~216 tiles in
// while 2D drew all of it.
describe("scout drone 3D route beads", () => {
  it("cover the longest leg a drone can fly (half the map on each axis)", () => {
    const longestLeg = Math.hypot(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);
    expect(SCOUT_ROUTE_MAX_BEADS * SCOUT_ROUTE_BEAD_SPACING).toBeGreaterThan(longestLeg);
  });
});
