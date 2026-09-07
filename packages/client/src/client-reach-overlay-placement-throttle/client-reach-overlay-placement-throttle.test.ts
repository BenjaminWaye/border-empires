import { describe, expect, it } from "vitest";
import { createReachOverlayPlacementThrottle } from "./client-reach-overlay-placement-throttle.js";

// Regression for the 3D border overlay briefly "following" the camera pan
// then jumping back to its correct position: pylon/segment scene positions
// are computed relative to sceneOrigin, which jumps atomically on every
// terrain rebuild -- independent of this throttle's own elapsed-time floor.
// Before this fix, a rebuild landing inside the cooldown window left
// already-placed geometry rendering at its stale sceneOrigin-relative
// position until the floor next opened.
describe("createReachOverlayPlacementThrottle", () => {
  it("allows the very first call regardless of elapsed time", () => {
    const throttle = createReachOverlayPlacementThrottle(48);
    expect(throttle.shouldRun(0, 10, 10)).toBe(true);
  });

  it("blocks a call inside the floor when sceneOrigin hasn't moved", () => {
    const throttle = createReachOverlayPlacementThrottle(48);
    throttle.shouldRun(1000, 10, 10);
    expect(throttle.shouldRun(1010, 10, 10)).toBe(false);
  });

  it("allows a call inside the floor once the elapsed time clears it", () => {
    const throttle = createReachOverlayPlacementThrottle(48);
    throttle.shouldRun(1000, 10, 10);
    expect(throttle.shouldRun(1050, 10, 10)).toBe(true);
  });

  it("bypasses the floor when sceneOrigin has moved (a rebuild just committed), even a moment after the last placement", () => {
    const throttle = createReachOverlayPlacementThrottle(48);
    throttle.shouldRun(1000, 10, 10);
    // Would be blocked by the elapsed-time floor alone (10ms < 48ms), but a
    // rebuild moved sceneOrigin, so placement must run to stay in lockstep
    // with the terrain instead of rendering stale positions for up to 48ms.
    expect(throttle.shouldRun(1010, 11, 10)).toBe(true);
    expect(throttle.shouldRun(1010, 10, 11)).toBe(true);
  });

  it("re-arms the floor from the moved call, not the original one", () => {
    const throttle = createReachOverlayPlacementThrottle(48);
    throttle.shouldRun(1000, 10, 10);
    throttle.shouldRun(1010, 11, 10); // sceneOrigin moved, bypasses floor
    expect(throttle.shouldRun(1020, 11, 10)).toBe(false); // 10ms since the moved call, origin unchanged
  });
});
