import { describe, expect, it } from "vitest";

import { isDoubleTap, resolveBoxSelectionMouseUpAction } from "./client-map-input.js";

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
