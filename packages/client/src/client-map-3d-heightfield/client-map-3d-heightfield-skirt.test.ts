import { describe, expect, it } from "vitest";
import { Mesh, MeshStandardMaterial, Scene } from "three";
import { createHeightfieldSkirt } from "./client-map-3d-heightfield-skirt.js";
import { createHillTerrain } from "../client-map-3d-hills.js";

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

  it("uses the same depth-biased material for the hill domes' skirt", () => {
    // The beach fringe covers hill coasts too; a separate hill skirt material
    // without the bias kept the dashes on coastal hills.
    const scene = new Scene();
    createHillTerrain(scene, 4, new MeshStandardMaterial());
    const skirts = scene.children.filter((c): c is Mesh => c instanceof Mesh && (c.material as MeshStandardMaterial).polygonOffset);
    expect(skirts).toHaveLength(1);
    expect((skirts[0]!.material as MeshStandardMaterial).polygonOffsetFactor).toBe(createHeightfieldSkirt(4).skirtMaterial.polygonOffsetFactor);
  });
});
