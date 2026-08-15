import { describe, expect, it } from "vitest";
import { MAX_PIXEL_RATIO, pixelRatioFor } from "./client-map-3d-pixel-ratio.js";

describe("pixelRatioFor", () => {
  it("renders at the device ratio on a healthy device", () => {
    expect(pixelRatioFor({ devicePixelRatio: 2, previousAttemptDiedDuringAllocation: false })).toBe(2);
  });

  it("treats a first run with no previous attempt as healthy", () => {
    expect(pixelRatioFor({ devicePixelRatio: 2, previousAttemptDiedDuringAllocation: undefined })).toBe(2);
  });

  it("caps the ratio so a 3x phone doesn't pay 9x the fill rate", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3, previousAttemptDiedDuringAllocation: false })).toBe(MAX_PIXEL_RATIO);
  });

  it("keeps a sub-1 ratio as reported rather than inflating the buffer", () => {
    expect(pixelRatioFor({ devicePixelRatio: 0.75, previousAttemptDiedDuringAllocation: false })).toBe(0.75);
  });

  // The regression this guard exists for: the renderer already dies during
  // *allocation* on some phones, and a 2x ratio is a 4x drawing buffer.
  it("backs off to 1 when the previous 3D attempt died during allocation", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3, previousAttemptDiedDuringAllocation: true })).toBe(1);
  });

  // The bug this test guards against: a session that reached "init-completed"
  // (allocation succeeded) but never got to run 8s to record "survived" —
  // e.g. a short visit, or a tab backgrounded before the timer fires, which
  // mobile does constantly — is a healthy run, not a crash. Treating it as
  // one silently caps every ordinary mobile session back to 1x.
  it("does not back off for a session that allocated fine but wasn't open long enough to be marked survived", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3, previousAttemptDiedDuringAllocation: false })).toBe(MAX_PIXEL_RATIO);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to 1 for an untrustworthy reported ratio (%s)",
    (ratio) => {
      expect(pixelRatioFor({ devicePixelRatio: ratio, previousAttemptDiedDuringAllocation: false })).toBe(1);
    }
  );
});
