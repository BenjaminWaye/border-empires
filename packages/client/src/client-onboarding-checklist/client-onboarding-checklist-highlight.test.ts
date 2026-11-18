import { describe, expect, it } from "vitest";
import { createGuideChevronGeometry } from "../client-map-3d-onboarding-checklist-highlight.js";
import { GUIDE_MARKER_HALO, GUIDE_MARKER_RING, guideChevronTriangles } from "./client-onboarding-checklist-highlight.js";

// Playtest 2026-11-12 (pt-oldphone, deuteranopia): "Guide marks are thin pale-green rings on pale-green/beige
// land". The marker now carries a dark halo (lightness contrast) and four arrowheads (shape), not hue alone.
const luminance = (rgba: string): number => {
  const [r, g, b] = (rgba.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

describe("guide marker non-colour cues", () => {
  it("draws the ring over a much darker halo", () => {
    expect(luminance(GUIDE_MARKER_RING) - luminance(GUIDE_MARKER_HALO)).toBeGreaterThan(120);
  });

  it("puts four arrowheads outside the ring, each tip pointing at the tile centre", () => {
    const [sx, sy, radius] = [100, 200, 12.4];
    const chevrons = guideChevronTriangles(sx, sy, radius, 20);
    expect(chevrons).toHaveLength(4);
    for (const [tip, left, right] of chevrons) {
      const dist = (p: [number, number]): number => Math.hypot(p[0] - sx, p[1] - sy);
      expect(dist(tip)).toBeGreaterThan(radius);
      // Tip is the vertex nearest the centre: the arrow points inward.
      expect(dist(tip)).toBeLessThan(dist(left));
      expect(dist(tip)).toBeLessThan(dist(right));
    }
  });

  it("gives the 3D marker the same four inward arrowheads beyond the ring", () => {
    const positions = createGuideChevronGeometry().getAttribute("position");
    expect(positions.count).toBe(12);
    for (let tri = 0; tri < 4; tri += 1) {
      const radial = (v: number): number => Math.hypot(positions.getX(tri * 3 + v), positions.getZ(tri * 3 + v));
      expect(radial(0)).toBeGreaterThan(0.7);
      expect(radial(0)).toBeLessThan(radial(1));
      expect(radial(0)).toBeLessThan(radial(2));
    }
  });
});
