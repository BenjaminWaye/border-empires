import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createForest } from "./client-map-3d-forest.js";

// Regression: trees never cast or received a shadow (both flags default to
// false on a fresh InstancedMesh), so even after the sun was made a
// shadow-casting light (client-map-3d-atmosphere.ts) trees still read as
// flatly lit and "pasted on" the ground instead of grounded by a shadow.
describe("createForest shadow wiring", () => {
  it("every tree mesh (canopy + trunk) casts and receives shadows", () => {
    const scene = new Scene();
    const forest = createForest(scene, 4);
    const meshes = scene.children.filter((c): c is InstancedMesh => c instanceof InstancedMesh);
    expect(meshes.length).toBe(3); // pine canopy, spruce canopy, trunk
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    forest.dispose();
  });
});
