import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createForest } from "./client-map-3d-forest.js";

// Regression for the leaf/deciduous tree species added alongside the
// original pine/spruce conifers: createForest must actually populate the
// third canopy mesh (leaf) for at least one tile in a reasonably sized
// sample, not just carry dead code that never gets a non-zero instance
// count. Mirrors client-map-3d-forest.test.ts's species-selection coverage.
describe("createForest leaf/deciduous species", () => {
  it("gives at least one sampled world tile the leaf canopy mesh a non-zero instance count", () => {
    const scene = new Scene();
    const forest = createForest(scene, 64);
    for (let worldX = 0; worldX < 32; worldX += 1) {
      for (let worldZ = 0; worldZ < 32; worldZ += 1) {
        forest.addInstance(worldX, worldZ, 0, worldX, worldZ);
      }
    }
    forest.commit();

    // Order is [pineCanopyMesh, spruceCanopyMesh, leafCanopyMesh, trunkMesh]
    // (client-map-3d-forest.ts) -- see client-map-3d-forest.test.ts's own
    // note on this ordering.
    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    expect(meshes).toHaveLength(4);
    const [pineMesh, spruceMesh, leafMesh] = meshes;
    expect(pineMesh!.count).toBeGreaterThan(0);
    expect(spruceMesh!.count).toBeGreaterThan(0);
    expect(leafMesh!.count).toBeGreaterThan(0);

    forest.dispose();
  });
});
