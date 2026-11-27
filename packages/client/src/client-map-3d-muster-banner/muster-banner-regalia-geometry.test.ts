import { describe, expect, it } from "vitest";

import { MUSTER_CROSSBAR_Y, MUSTER_PLINTH_RADIUS } from "./muster-banner-geometry.js";
import {
  AUREOLE_Y, getMusterBannerRegaliaGeometry, REGALIA_MAX_RADIUS, REGALIA_SPARKLE_POINTS, REGALIA_TOP_Y,
  STREAMER_LENGTH, STREAMER_OUTER_OFFSET, STREAMER_TOP_Y, STREAMER_WIDTH, STREAMER_X
} from "./muster-banner-regalia-geometry.js";

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
    // Grander, not a taller beacon: at most 15% above the standard finial.
    expect(REGALIA_TOP_Y).toBeLessThan(STANDARD_TOP_Y * 1.15);
  });

  it("keeps its poly count small enough for every flag on screen to carry it", () => {
    const triangles = [regalia.gold, regalia.tinted, regalia.aureole, regalia.halo].reduce((sum, g) => sum + g.getAttribute("position").count, 0) / 3 + (regalia.streamers.index?.count ?? 0) / 3;
    // Two thirds of a Great Project monument's 6,000-triangle budget (docs/monument-models.md).
    expect(triangles).toBeLessThan(4_000);
  });

  it("keeps the spinning parts and the streamers inside the same bounds", () => {
    for (const geometry of [regalia.aureole, regalia.halo]) {
      geometry.computeBoundingSphere();
      expect(AUREOLE_Y + geometry.boundingSphere!.radius).toBeLessThanOrEqual(REGALIA_TOP_Y + 1e-6);
      expect(geometry.boundingSphere!.radius).toBeLessThan(MUSTER_PLINTH_RADIUS);
    }
    // The ripple (muster-banner-regalia-materials.ts) swings a tail out by at most 0.07 + 0.018, times 1.6 for the outer pair.
    expect(STREAMER_X + STREAMER_WIDTH / 2 + 0.088).toBeLessThan(0.5);
    expect(STREAMER_X + STREAMER_OUTER_OFFSET + STREAMER_WIDTH * 0.35 + 0.088 * 1.6).toBeLessThan(0.5);
    expect(STREAMER_TOP_Y - STREAMER_LENGTH).toBeGreaterThan(0.3);
  });

  it("puts every sparkle on the regalia, inside the tile", () => {
    for (const [x, y, z] of REGALIA_SPARKLE_POINTS) {
      expect(Math.hypot(x, z)).toBeLessThan(0.3);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(REGALIA_TOP_Y + 1e-6);
    }
  });
});
