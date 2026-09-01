import { describe, expect, it } from "vitest";
import { createHeightfield } from "./client-map-3d-heightfield.js";

// Regression: the ground mesh explicitly set receiveShadow = false, so even
// after trees/structures were made to cast real shadows (client-map-3d-
// forest.ts, client-map-3d-structure-builder.ts) and the sun was made a
// shadow-casting light (client-map-3d-atmosphere.ts), nothing ever landed on
// the ground -- ground never casts onto itself, but it must still receive.
describe("createHeightfield shadow wiring", () => {
  it("the ground mesh receives shadows but does not cast them", () => {
    const heightfield = createHeightfield();
    expect(heightfield.mesh.receiveShadow).toBe(true);
    expect(heightfield.mesh.castShadow).toBe(false);
    heightfield.dispose();
  });
});
