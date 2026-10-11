import { describe, expect, it } from "vitest";
import { createMountainModelGeometry, FILLER_MODELS, MOUNTAIN_MODELS, mountainModelHeight, SUMMIT_MODELS } from "./client-map-3d-mountain-models.js";

describe("low-poly rock-cluster mountain models", () => {
  it("has summit and filler models", () => {
    expect(SUMMIT_MODELS.length).toBeGreaterThanOrEqual(3);
    expect(FILLER_MODELS.length).toBeGreaterThanOrEqual(2);
  });

  for (const model of MOUNTAIN_MODELS) {
    it(`${model.name}: a rock cluster standing on its footprint, sunk just under the ground, tile-sized`, () => {
      // Measured over each rock's centre.
      const centreHeight = Math.max(...model.rocks.map((r) => mountainModelHeight(model, r.x, r.z)));
      expect(centreHeight).toBeGreaterThan(model.role === "summit" ? 0.85 : 0.35);
      expect(centreHeight).toBeLessThan(1.5);
      const geometry = createMountainModelGeometry(model, "temperate");
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      expect(box.min.y).toBeLessThan(0);
      expect(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z)).toBeLessThan(0.9);
      geometry.dispose();
    });
  }

  it("marks where snow can settle on the summit models, and colours the stone by climate", () => {
    const spire = MOUNTAIN_MODELS.find((m) => m.name === "peak")!;
    const temperate = createMountainModelGeometry(spire, "temperate");
    const alpine = createMountainModelGeometry(spire, "alpine");
    const caps = temperate.getAttribute("aCap");
    expect(Array.from({ length: caps.count }, (_, i) => caps.getX(i)).some((v) => v === 1)).toBe(true);
    expect(Array.from(temperate.getAttribute("color").array)).not.toEqual(Array.from(alpine.getAttribute("color").array));
    temperate.dispose();
    alpine.dispose();
  });
});
