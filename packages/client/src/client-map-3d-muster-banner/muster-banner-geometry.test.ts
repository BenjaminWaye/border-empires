import { describe, expect, it } from "vitest";
import { getMusterBannerGeometry, MUSTER_PLINTH_RADIUS } from "./muster-banner-geometry.js";

describe("muster banner plinth", () => {
  it("stands on the towns' flared stone skirt rather than a black iron slab", () => {
    // Regression: the slab under the owner's band was ironDark on the metal
    // mesh and read as a black band on any tile sloping below the plinth.
    const { body, metal } = getMusterBannerGeometry();
    metal.computeBoundingBox();
    expect(metal.boundingBox!.min.y).toBeGreaterThan(-0.03);
    const position = body.getAttribute("position");
    let footReach = 0;
    for (let i = 0; i < position.count; i += 1) {
      if (Math.abs(position.getY(i) + 0.1) < 1e-4) footReach = Math.max(footReach, Math.hypot(position.getX(i), position.getZ(i)));
    }
    expect(footReach).toBeGreaterThan(MUSTER_PLINTH_RADIUS * 1.05);
  });
});
