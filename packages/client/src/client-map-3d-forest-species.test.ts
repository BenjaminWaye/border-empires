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

// Regression for addSparseLeafInstance (the decorative light-grass "scatter"
// sapling -- see isLightGrassScatterTile in client-constants.ts): it must
// add exactly one trunk + one leaf-canopy instance per call, sharing the
// same pools addInstance uses, without touching pine/spruce at all.
describe("createForest addSparseLeafInstance", () => {
  it("adds exactly one trunk and one leaf-canopy instance, leaving pine/spruce untouched", () => {
    const scene = new Scene();
    const forest = createForest(scene, 4);
    forest.addSparseLeafInstance(0, 0, 0, 5, 9);
    forest.commit();

    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    const [pineMesh, spruceMesh, leafMesh, trunkMesh] = meshes;
    expect(pineMesh!.count).toBe(0);
    expect(spruceMesh!.count).toBe(0);
    expect(leafMesh!.count).toBe(1);
    expect(trunkMesh!.count).toBe(1);

    forest.dispose();
  });

  // Regression: addSparseLeafInstance used to gate the trunk write and the
  // canopy write behind two independent capacity checks, so near the
  // instance budget a tile could get a trunk with no canopy (or vice versa).
  // A full leaf-canopy pool (trunk pool still has room) must now skip the
  // whole instance, not just the canopy half.
  it("never adds an orphan trunk when the leaf canopy pool is full but the trunk pool isn't", () => {
    const scene = new Scene();
    const forest = createForest(scene, 1); // maxInstances (per canopy pool) === TREES_PER_TILE === 5
    // Fill the leaf-canopy pool exactly (5 calls); the shared trunk pool is
    // sized maxInstances * 2 = 10, so it still has plenty of room afterward.
    for (let i = 0; i < 5; i += 1) forest.addSparseLeafInstance(i, i, 0, i, i);
    forest.addSparseLeafInstance(10, 10, 0, 6, 6); // leaf pool is full; trunk pool alone still has room
    forest.commit();

    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    const [, , leafMesh, trunkMesh] = meshes;
    expect(leafMesh!.count).toBe(5);
    expect(trunkMesh!.count).toBe(5); // not 6 -- the 6th call's trunk must not be added alone

    forest.dispose();
  });
});
