import { DoubleSide } from "three";
import { describe, expect, it, vi } from "vitest";
import { createFoodTileMaterial } from "./client-food-tile-material.js";

describe("food tile material", () => {
  it("keeps the source model's open basins and thin hoist surfaces double-sided", () => {
    const material = createFoodTileMaterial();
    expect(material.side).toBe(DoubleSide);
    material.dispose();
  });

  it("releases its shared bump/roughness texture on overlay disposal", () => {
    const material = createFoodTileMaterial();
    expect(material.bumpMap).toBe(material.roughnessMap);
    const disposed = vi.fn();
    material.bumpMap!.addEventListener("dispose", disposed);
    material.dispose();
    expect(disposed).toHaveBeenCalledOnce();
  });
});
