import { describe, expect, it } from "vitest";
import { MAX_PIXEL_RATIO, pixelRatioFor } from "./client-map-3d-pixel-ratio.js";

describe("pixelRatioFor", () => {
  it("renders at the device ratio on a healthy device", () => {
    expect(pixelRatioFor({ devicePixelRatio: 2 })).toBe(2);
  });

  it("treats an absent cap as full quality", () => {
    expect(pixelRatioFor({ devicePixelRatio: 2, maxPixelRatio: undefined })).toBe(2);
  });

  it("caps the ratio so a 3x phone doesn't pay 9x the fill rate", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3 })).toBe(MAX_PIXEL_RATIO);
  });

  it("keeps a sub-1 ratio as reported rather than inflating the buffer", () => {
    expect(pixelRatioFor({ devicePixelRatio: 0.75 })).toBe(0.75);
  });

  // The regression this guard exists for: the renderer already dies during
  // *allocation* on some phones, and a 2x ratio is a 4x drawing buffer. The
  // decision of *when* to ask for a lower ratio now lives in the degradation
  // ladder (client-map-3d-quality-tier.ts); this module honours the cap.
  it("honours a degraded cap from the quality ladder", () => {
    expect(pixelRatioFor({ devicePixelRatio: 3, maxPixelRatio: 1 })).toBe(1);
    expect(pixelRatioFor({ devicePixelRatio: 3, maxPixelRatio: 1.5 })).toBe(1.5);
  });

  it("still lets a low-DPI device win over a higher cap", () => {
    expect(pixelRatioFor({ devicePixelRatio: 1, maxPixelRatio: 1.5 })).toBe(1);
  });

  it("never exceeds MAX_PIXEL_RATIO even if handed a larger cap", () => {
    expect(pixelRatioFor({ devicePixelRatio: 4, maxPixelRatio: 8 })).toBe(MAX_PIXEL_RATIO);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to 1 for an untrustworthy reported ratio (%s)",
    (ratio) => {
      expect(pixelRatioFor({ devicePixelRatio: ratio })).toBe(1);
    }
  );

  it.each([0, -1, Number.NaN])("ignores an untrustworthy cap (%s) rather than collapsing the buffer", (cap) => {
    expect(pixelRatioFor({ devicePixelRatio: 2, maxPixelRatio: cap })).toBe(2);
  });
});
