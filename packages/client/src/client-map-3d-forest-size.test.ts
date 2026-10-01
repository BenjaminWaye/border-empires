import { describe, expect, it } from "vitest";
import { Box3, InstancedMesh, Matrix4, Scene } from "three";
import { LAYOUTS, TREES_PER_TILE, createForest } from "./client-map-3d-forest.js";
import { createMountainMassifs } from "./client-map-3d-mountain-massif.js";
import { createTropicalForest } from "./client-map-3d-tropical-forest.js";

// Highest world-space Y reached by any instance of any InstancedMesh in scene.
const tallestInstanceTop = (scene: Scene): number => {
  const matrix = new Matrix4();
  const box = new Box3();
  let top = -Infinity;
  for (const child of scene.children) {
    if (!(child instanceof InstancedMesh)) continue;
    child.geometry.computeBoundingBox();
    for (let i = 0; i < child.count; i += 1) {
      child.getMatrixAt(i, matrix);
      box.copy(child.geometry.boundingBox!).applyMatrix4(matrix);
      top = Math.max(top, box.max.y);
    }
  }
  return top;
};

const mountainTop = (): number => {
  const scene = new Scene();
  const massifs = createMountainMassifs(scene, 1);
  massifs.addInstance(0, 0, 0);
  massifs.commit();
  const top = tallestInstanceTop(scene);
  massifs.dispose();
  return top;
};

// Regression: forest trees stood ~1.6-1.8 tall -- taller than the ~1.2
// mountain massifs -- so forests towered over mountain ranges in the 3D map.
// Trees are now about half a mountain's height.
describe("3D forest tree size", () => {
  it("keeps every temperate tree species at roughly half a mountain's height", () => {
    const scene = new Scene();
    const forest = createForest(scene, 256);
    for (let x = 0; x < 16; x += 1) for (let z = 0; z < 16; z += 1) forest.addInstance(x * 2, z * 2, 0, x, z);
    forest.commit();
    const ratio = tallestInstanceTop(scene) / mountainTop();
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
    forest.dispose();
  });

  it("keeps tropical palms at roughly half a mountain's height", () => {
    const scene = new Scene();
    const forest = createTropicalForest(scene, 16);
    for (let x = 0; x < 16; x += 1) forest.addInstance(x * 2, 0, 0, x, 0);
    forest.commit();
    const ratio = tallestInstanceTop(scene) / mountainTop();
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThanOrEqual(0.6);
    forest.dispose();
  });

  it("plants 7-9 trees per forest tile, within the per-tile instance budget", () => {
    for (const layout of LAYOUTS) {
      expect(layout.length).toBeGreaterThanOrEqual(7);
      expect(layout.length).toBeLessThanOrEqual(TREES_PER_TILE);
      expect(TREES_PER_TILE).toBe(9);
    }
  });
});
