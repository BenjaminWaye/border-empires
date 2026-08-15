import { describe, expect, it } from "vitest";
import { MAX_PIXEL_RATIO, pixelRatioFor } from "./client-map-3d-pixel-ratio.js";

describe("pixelRatioFor", () => {
  it("renders at the device ratio on a healthy device", () => {
    expect(pixelRatioFor({ devicePixelRatio: 2, previousAttemptSurvived: true })).toBe(2);
  });

  it("treats a first run with no previous attempt as healthy", () => {
    expect(pixelRatioFor({ devicePixelRatio: 2, previousAttemptSurvived: undefined })).toBe(2);
  });

  it("caps the ratio so a 3x phone doesn't pay 9x the fill rate", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3, previousAttemptSurvived: true })).toBe(MAX_PIXEL_RATIO);
  });

  it("keeps a sub-1 ratio as reported rather than inflating the buffer", () => {
    expect(pixelRatioFor({ devicePixelRatio: 0.75, previousAttemptSurvived: true })).toBe(0.75);
  });

  // The regression this guard exists for: the renderer already dies during
  // construction on some phones, and a 2x ratio is a 4x drawing buffer.
  it("backs off to 1 when the previous 3D attempt did not survive", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3, previousAttemptSurvived: false })).toBe(1);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to 1 for an untrustworthy reported ratio (%s)",
    (ratio) => {
      expect(pixelRatioFor({ devicePixelRatio: ratio, previousAttemptSurvived: true })).toBe(1);
    }
  );
});
