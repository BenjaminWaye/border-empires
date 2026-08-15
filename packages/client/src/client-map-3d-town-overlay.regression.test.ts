import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createTownOverlay } from "./client-map-3d-town-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] => {
  const meshes: InstancedMesh[] = [];
  scene.traverse((child) => {
    if (child instanceof InstancedMesh) meshes.push(child);
  });
  return meshes;
};

describe("town overlay", () => {
  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn. Town slot
    // capacity is sized maxTiles * factor (worst case every visible tile is a metropolis),
    // so at a realistic desktop tile budget most of each slot's capacity sits idle.
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, "METROPOLIS");
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
      if (mesh.instanceColor) {
        const colorRanges = mesh.instanceColor.updateRanges;
        expect(colorRanges).toHaveLength(1);
        expect(colorRanges[0]).toEqual({ start: 0, count: mesh.count * 3 });
      }
    }

    overlay.dispose();
  });

  it("clears update ranges back to empty on a commit with zero instances", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 10);

    overlay.addInstance(0, 0, 0, "METROPOLIS");
    overlay.commit();
    overlay.clear();
    overlay.commit();

    for (const mesh of instancedMeshes(scene)) {
      expect(mesh.count).toBe(0);
      expect(mesh.instanceMatrix.updateRanges).toHaveLength(0);
    }

    overlay.dispose();
  });
});
