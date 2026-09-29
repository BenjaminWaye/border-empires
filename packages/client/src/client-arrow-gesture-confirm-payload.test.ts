import { describe, expect, it } from "vitest";
import { buildArrowGestureSetMusterPayload } from "./client-arrow-gesture-confirm-payload.js";

describe("buildArrowGestureSetMusterPayload", () => {
  it("builds a MARCH SET_MUSTER payload from origin/target/commitManpower", () => {
    expect(buildArrowGestureSetMusterPayload({ x: 3, y: 4 }, { x: 9, y: 1 }, 90)).toEqual({
      type: "SET_MUSTER",
      x: 3,
      y: 4,
      mode: "MARCH",
      targetX: 9,
      targetY: 1,
      commitManpower: 90
    });
  });

  it("keeps origin and target distinct even when both coordinates are equal on one axis", () => {
    const payload = buildArrowGestureSetMusterPayload({ x: 5, y: 5 }, { x: 5, y: 12 }, 60);
    expect(payload.x).toBe(5);
    expect(payload.y).toBe(5);
    expect(payload.targetX).toBe(5);
    expect(payload.targetY).toBe(12);
  });
});
