import { describe, expect, it } from "vitest";

import { MUSTER_CROSSBAR_Y, MUSTER_PLINTH_RADIUS } from "./muster-banner-geometry.js";
import { getMusterBannerRegaliaGeometry, REGALIA_MAX_RADIUS, REGALIA_TOP_Y } from "./muster-banner-regalia-geometry.js";

// The standard banner's spear finial tops out here (muster-banner-geometry.ts).
const STANDARD_TOP_Y = MUSTER_CROSSBAR_Y + 0.096 + 0.06;

describe("High-noble standard regalia", () => {
  const regalia = getMusterBannerRegaliaGeometry();

  it("builds gilded and owner-coloured parts once and shares them", () => {
    expect(getMusterBannerRegaliaGeometry()).toBe(regalia);
    expect(regalia.gold.getAttribute("position").count).toBeGreaterThan(0);
    expect(regalia.tinted.getAttribute("position").count).toBeGreaterThan(0);
  });

  it("stays inside the tile and close to the standard flag's footprint and height", () => {
    for (const geometry of [regalia.gold, regalia.tinted]) {
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      // Within the tile (half a tile either way) and no wider than the gold rim round the plinth.
      for (const extent of [box.min.x, box.max.x, box.min.z, box.max.z]) {
        expect(Math.abs(extent)).toBeLessThanOrEqual(REGALIA_MAX_RADIUS + 1e-6);
        expect(Math.abs(extent)).toBeLessThan(0.5);
      }
      expect(box.max.y).toBeLessThanOrEqual(REGALIA_TOP_Y + 1e-6);
      expect(box.min.y).toBeGreaterThanOrEqual(0);
    }
    expect(REGALIA_MAX_RADIUS).toBeLessThan(MUSTER_PLINTH_RADIUS * 1.1);
    // Grander, not a taller beacon: at most a tenth above the standard finial.
    expect(REGALIA_TOP_Y).toBeLessThan(STANDARD_TOP_Y * 1.1);
  });

  it("keeps its poly count small enough for every flag on screen to carry it", () => {
    const triangles = (regalia.gold.getAttribute("position").count + regalia.tinted.getAttribute("position").count) / 3;
    expect(triangles).toBeLessThan(2_500);
  });
});
