import { describe, expect, it } from "vitest";
import { Color } from "three";
import { TOWN_COLORS } from "../client-map-3d-town-overlay/town-mesh-builder.js";
import { getMusterBannerGeometry, MUSTER_PLINTH_RADIUS } from "./muster-banner-geometry.js";

describe("muster banner plinth", () => {
  it("stands on the towns' flared stone skirt rather than a black iron slab", () => {
    // Regression: the slab under the owner's band was ironDark on the metal
    // mesh and read as a black band on any tile sloping below the plinth.
    const { body, metal } = getMusterBannerGeometry();
    metal.computeBoundingBox();
    expect(metal.boundingBox!.min.y).toBeGreaterThan(-0.03);
    const stone = new Color(TOWN_COLORS.stoneDark);
    const position = body.getAttribute("position");
    const color = body.getAttribute("color");
    let footReach = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(position.getY(i) + 0.1) >= 1e-4) continue;
      footReach = Math.max(footReach, Math.hypot(position.getX(i), position.getZ(i)));
      // A lit shade of stoneDark (baked occlusion may darken it), never near-black.
      const shade = color.getY(i) / stone.g;
      expect(shade).toBeGreaterThan(0.5);
      expect(color.getX(i) / stone.r).toBeCloseTo(shade, 2);
      expect(color.getZ(i) / stone.b).toBeCloseTo(shade, 2);
    }
    expect(footReach).toBeGreaterThan(MUSTER_PLINTH_RADIUS * 1.05);
  });
});
