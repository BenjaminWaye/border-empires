import { describe, expect, it } from "vitest";

import { DOUBLE_TAP_ZOOM_STEP, MAX_ZOOM, MIN_ZOOM, MOBILE_LOGIN_ZOOM } from "../client-constants.js";
import { isDoubleTap, resolveBoxSelectionMouseUpAction, splitContinuousPan } from "./client-map-input.js";

const WORLD_WIDTH = 450;
const wrap = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

describe("resolveBoxSelectionMouseUpAction", () => {
  it("does nothing when the drag selection is empty", () => {
    expect(resolveBoxSelectionMouseUpAction([])).toEqual({ type: "none" });
  });

  it("opens the bulk menu instead of auto-queuing neutral frontier tiles", () => {
    expect(resolveBoxSelectionMouseUpAction(["358,180", "358,179", "358,178"])).toEqual({
      type: "open-bulk-menu",
      targetKeys: ["358,180", "358,179", "358,178"]
    });
  });
});

describe("isDoubleTap", () => {
  const base = { maxDelayMs: 300, maxDistancePx: 20 };

  it("is false for the very first tap (no prior tap recorded)", () => {
    expect(
      isDoubleTap({ ...base, now: 1000, location: { x: 10, y: 10 }, lastTapTime: 0, lastTapLocation: undefined })
    ).toBe(false);
  });

  it("is true for a second tap close in time and space to the first", () => {
    expect(
      isDoubleTap({
        ...base,
        now: 1200,
        location: { x: 12, y: 11 },
        lastTapTime: 1000,
        lastTapLocation: { x: 10, y: 10 }
      })
    ).toBe(true);
  });

  it("is false once the delay between taps exceeds the max", () => {
    expect(
      isDoubleTap({
        ...base,
        now: 1301,
        location: { x: 10, y: 10 },
        lastTapTime: 1000,
        lastTapLocation: { x: 10, y: 10 }
      })
    ).toBe(false);
  });

  it("is false when the second tap lands too far from the first", () => {
    expect(
      isDoubleTap({
        ...base,
        now: 1100,
        location: { x: 40, y: 40 },
        lastTapTime: 1000,
        lastTapLocation: { x: 10, y: 10 }
      })
    ).toBe(false);
  });
});

describe("mobile double-tap zoom values", () => {
  // Pinned to the on-device values found via the Settings zoom debug
  // readout: login at 58, double-tap toggles down to 26 and back to 58.
  it("swings the mobile login zoom down to exactly 26 on the first double-tap and back on the second", () => {
    expect(MOBILE_LOGIN_ZOOM).toBe(58);
    expect(MOBILE_LOGIN_ZOOM - DOUBLE_TAP_ZOOM_STEP).toBe(26);
    expect(MOBILE_LOGIN_ZOOM - DOUBLE_TAP_ZOOM_STEP + DOUBLE_TAP_ZOOM_STEP).toBe(MOBILE_LOGIN_ZOOM);
  });

  it("keeps both the login zoom and its zoomed-out counterpart within the pan/zoom bounds", () => {
    expect(MOBILE_LOGIN_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
    expect(MOBILE_LOGIN_ZOOM - DOUBLE_TAP_ZOOM_STEP).toBeGreaterThanOrEqual(MIN_ZOOM);
  });
});

describe("splitContinuousPan", () => {
  it("keeps camInt unchanged and camSub at 0 for a zero-delta drag", () => {
    expect(splitContinuousPan(200, 0, 22, wrap)).toEqual({ camInt: 200, camSub: 0 });
  });

  it("splits a sub-tile drag into an unchanged camInt and a fractional camSub", () => {
    // 11px at zoom 22 is exactly half a tile.
    const { camInt, camSub } = splitContinuousPan(200, 11, 22, wrap);
    expect(camInt).toBe(199); // dragging right moves the camera left
    expect(camSub).toBeCloseTo(0.5, 10);
  });

  it("crosses into the next tile once the drag exceeds a full tile width", () => {
    const { camInt, camSub } = splitContinuousPan(200, 22, 22, wrap);
    expect(camInt).toBe(199);
    expect(camSub).toBeCloseTo(0, 10);
  });

  it("always returns camSub in [0, 1)", () => {
    for (let px = -100; px <= 100; px += 3) {
      const { camSub } = splitContinuousPan(200, px, 22, wrap);
      expect(camSub).toBeGreaterThanOrEqual(0);
      expect(camSub).toBeLessThan(1);
    }
  });

  it("wraps at the world seam instead of drifting outside [0, WORLD_WIDTH)", () => {
    const { camInt, camSub } = splitContinuousPan(0, 22, 22, wrap); // drags 1 tile past the west edge
    expect(camInt).toBe(WORLD_WIDTH - 1);
    expect(camSub).toBeCloseTo(0, 10);
  });

  it("reconstructs the pre-split continuous position exactly (camInt + camSub)", () => {
    for (const start of [0, 199.25, 449.9]) {
      for (const px of [-37, -1, 0, 1, 37, 90]) {
        const zoom = 22;
        const expectedContinuous = wrap(start - px / zoom);
        const { camInt, camSub } = splitContinuousPan(start, px, zoom, wrap);
        expect(camInt + camSub).toBeCloseTo(expectedContinuous, 10);
      }
    }
  });
});
