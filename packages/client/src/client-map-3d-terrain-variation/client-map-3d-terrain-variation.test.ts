import { describe, expect, it } from "vitest";

import { terrainShadeVariantAt } from "./client-map-3d-terrain-variation.js";

describe("3d terrain variation", () => {
  it("is deterministic for the same tile", () => {
    const a = terrainShadeVariantAt(120, 77);
    const b = terrainShadeVariantAt(120, 77);
    expect(a).toBe(b);
  });

  it("keeps local coherence instead of checkerboard randomness", () => {
    const center = terrainShadeVariantAt(200, 200);
    const neighbors = [
      terrainShadeVariantAt(201, 200),
      terrainShadeVariantAt(199, 200),
      terrainShadeVariantAt(200, 201),
      terrainShadeVariantAt(200, 199)
    ];
    const equalNeighborCount = neighbors.filter((variant) => variant === center).length;
    expect(equalNeighborCount).toBeGreaterThan(0);
  });
});
