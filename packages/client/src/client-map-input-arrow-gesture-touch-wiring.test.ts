import { describe, expect, it } from "vitest";
import {
  exceedsLongPressMoveThreshold,
  TOUCH_LONG_PRESS_MAX_MOVE_PX
} from "./client-map-input-arrow-gesture-touch-wiring.js";

describe("client-map-input-arrow-gesture-touch-wiring (F2 long-press-vs-drag threshold)", () => {
  it("does not exceed the threshold when the touch hasn't moved at all", () => {
    expect(exceedsLongPressMoveThreshold(0, 0, TOUCH_LONG_PRESS_MAX_MOVE_PX)).toBe(false);
  });

  it("does not exceed the threshold for small jitter under the limit", () => {
    expect(exceedsLongPressMoveThreshold(3, 4, 12)).toBe(false); // hypot(3,4) = 5
  });

  it("exceeds the threshold once movement crosses it", () => {
    expect(exceedsLongPressMoveThreshold(9, 12, 12)).toBe(true); // hypot(9,12) = 15
  });

  it("is exactly at the boundary when movement equals the threshold (not exceeding)", () => {
    expect(exceedsLongPressMoveThreshold(12, 0, 12)).toBe(false);
  });

  it("treats movement in any direction the same (negative deltas)", () => {
    expect(exceedsLongPressMoveThreshold(-9, -12, 12)).toBe(true);
  });
});
