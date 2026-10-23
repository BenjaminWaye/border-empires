import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { TREES_PER_TILE, createForest } from "./client-map-3d-forest.js";

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

    // One merged trunk+canopy mesh per species, in the order pine, spruce,
    // leaf (client-map-3d-forest.ts).
    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    expect(meshes).toHaveLength(3);
    const [pineMesh, spruceMesh, leafMesh] = meshes;
    expect(pineMesh!.count).toBeGreaterThan(0);
    expect(spruceMesh!.count).toBeGreaterThan(0);
    expect(leafMesh!.count).toBeGreaterThan(0);

    forest.dispose();
  });
});

// Regression for addSparseLeafInstance (the decorative light-grass "scatter"
// sapling -- see isLightGrassScatterTile in client-constants.ts): it must
// add exactly one leaf tree per call, sharing the pool addInstance uses,
// without touching pine/spruce at all.
describe("createForest addSparseLeafInstance", () => {
  it("adds exactly one leaf tree, leaving pine/spruce untouched", () => {
    const scene = new Scene();
    const forest = createForest(scene, 4);
    forest.addSparseLeafInstance(0, 0, 0, 5, 9);
    forest.commit();

    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    const [pineMesh, spruceMesh, leafMesh] = meshes;
    expect(pineMesh!.count).toBe(0);
    expect(spruceMesh!.count).toBe(0);
    expect(leafMesh!.count).toBe(1);

    forest.dispose();
  });

  // Regression: near the instance budget a sapling used to be able to land
  // as a trunk without a canopy. Trunk and canopy are now one instance, so a
  // full leaf pool simply skips the sapling -- it must never overflow.
  it("skips saplings once the leaf pool is full instead of overflowing it", () => {
    const scene = new Scene();
    const forest = createForest(scene, 1); // each species pool holds TREES_PER_TILE trees
    for (let i = 0; i < TREES_PER_TILE + 1; i += 1) forest.addSparseLeafInstance(i, i, 0, i, i);
    forest.commit();

    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    const [, , leafMesh] = meshes;
    expect(leafMesh!.count).toBe(TREES_PER_TILE);

    forest.dispose();
  });
});
