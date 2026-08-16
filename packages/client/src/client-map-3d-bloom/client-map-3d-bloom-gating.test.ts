import { describe, expect, it } from "vitest";
import { bloomEnabledFor } from "./client-map-3d-bloom-gating.js";

describe("bloomEnabledFor", () => {
  it("enables bloom on a healthy device (no previous attempt)", () => {
    expect(bloomEnabledFor({ previousAttemptDiedDuringAllocation: undefined })).toBe(true);
  });

  it("enables bloom when the previous attempt survived or completed allocation", () => {
    expect(bloomEnabledFor({ previousAttemptDiedDuringAllocation: false })).toBe(true);
  });

  // The regression this guard exists for: bloom's extra render targets are
  // real memory on top of an already-tight allocation, and this is the one
  // signal that actually means "this device is short on GPU memory."
  it("disables bloom when the previous attempt died during allocation", () => {
    expect(bloomEnabledFor({ previousAttemptDiedDuringAllocation: true })).toBe(false);
  });
});
