import { describe, expect, it } from "vitest";
import { createMountainModelGeometry, FILLER_MODELS, MOUNTAIN_MODELS, mountainModelHeight, SUMMIT_MODELS } from "./client-map-3d-mountain-models.js";

describe("low-poly rock-cluster mountain models", () => {
  it("has summit and filler models", () => {
    expect(SUMMIT_MODELS.length).toBeGreaterThanOrEqual(3);
    expect(FILLER_MODELS.length).toBeGreaterThanOrEqual(2);
  });

  for (const model of MOUNTAIN_MODELS) {
    it(`${model.name}: a rock cluster standing on its footprint, sunk just under the ground, tile-sized`, () => {
      const geometry = createMountainModelGeometry(model, "temperate");
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      // Its summit (which may lean off-centre).
      expect(box.max.y).toBeGreaterThan(model.role === "summit" ? 0.85 : 0.3);
      expect(box.max.y).toBeLessThan(1.5);
      // The surface lookup finds rock over the main rock's centre.
      expect(mountainModelHeight(model, model.rocks[0]!.x, model.rocks[0]!.z)).toBeGreaterThan(0.2);
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
  it("every rock is broadest at its base, never bulging out above it (bulges read as boulders)", () => {
    for (const model of MOUNTAIN_MODELS) {
      // One rock at a time, so the distance is from that rock's own centre.
      for (const rock of model.rocks) {
        const single = { ...model, rocks: [rock] };
        const pos = createMountainModelGeometry(single, "temperate").getAttribute("position");
        let base = Infinity;
        let above = 0;
        for (let i = 0; i < pos.count; i += 1) {
          const d = Math.hypot(pos.getX(i) - rock.x, pos.getZ(i) - rock.z);
          if (pos.getY(i) <= -0.049) base = Math.min(base, d);
          else above = Math.max(above, d);
        }
        expect(above).toBeLessThan(base);
      }
    }
  });
});
