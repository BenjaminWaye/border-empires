import { describe, expect, it } from "vitest";
import { createHeightfieldSkirt } from "./client-map-3d-heightfield-skirt.js";

describe("heightfield coast skirt", () => {
  it("loses depth ties to the beach fringe laid over its top", () => {
    // The shore sand fringe starts a hair above the coast edge the skirt
    // hangs from; without a depth bias the skirt's top showed through the
    // beach as dashed grey lines along the old square coastline.
    const { skirtMaterial } = createHeightfieldSkirt(4);
    expect(skirtMaterial.polygonOffset).toBe(true);
    expect(skirtMaterial.polygonOffsetFactor).toBeGreaterThan(0);
    expect(skirtMaterial.polygonOffsetUnits).toBeGreaterThan(0);
  });
});
