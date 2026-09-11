import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene, TorusGeometry } from "three";
import { createSiegeOutpostOverlay } from "./client-map-3d-siege-outpost-overlay.js";

const instancedMeshesIn = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

// Per-outpost piece-per-slot counts mirror the pieceSpecs table in the
// overlay: 71 static placements + the 7 animated slots, all own InstancedMeshes.
const STATIC_PIECES_PER_OUTPOST = 71;
const ANIMATED_SLOTS = 7;

describe("createSiegeOutpostOverlay", () => {
  it("places one full staging base per instance and all meshes cast+receive shadows", () => {
    const scene = new Scene();
    const overlay = createSiegeOutpostOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, 5, 7);
    overlay.addInstance(1.2, -0.8, 0, 9, 3);
    overlay.commit();
    const meshes = instancedMeshesIn(scene);
    expect(meshes.length).toBeGreaterThan(0);
    const total = meshes.reduce((sum, mesh) => sum + mesh.count, 0);
    expect(total).toBe((STATIC_PIECES_PER_OUTPOST + ANIMATED_SLOTS) * 2);
    for (const mesh of meshes) {
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    overlay.dispose();
  });

  it("seeds and then animates the lens rings on update()", () => {
    const scene = new Scene();
    const overlay = createSiegeOutpostOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, 5, 7);
    overlay.addInstance(2, 0, 0, 11, 13);
    overlay.commit();
    const ring = instancedMeshesIn(scene).find(
      (mesh) => mesh.geometry.type === "TorusGeometry" && (mesh.geometry as TorusGeometry).parameters.radius === 0.095
    );
    expect(ring).toBeDefined();
    expect(ring!.count).toBe(2);
    overlay.update(1000);
    const before = [...ring!.instanceMatrix.array.slice(0, 16)];
    overlay.update(2000);
    const after = [...ring!.instanceMatrix.array.slice(0, 16)];
    expect(after).not.toEqual(before);
    overlay.dispose();
  });

  it("clear() empties every slot", () => {
    const scene = new Scene();
    const overlay = createSiegeOutpostOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, 5, 7);
    overlay.commit();
    const totalBefore = instancedMeshesIn(scene).reduce((sum, mesh) => sum + mesh.count, 0);
    expect(totalBefore).toBe(STATIC_PIECES_PER_OUTPOST + ANIMATED_SLOTS);
    overlay.clear();
    // The render loop always re-commits after a clear, so the resetted
    // placement counts become visible on the meshes there.
    overlay.commit();
    const totalAfter = instancedMeshesIn(scene).reduce((sum, mesh) => sum + mesh.count, 0);
    expect(totalAfter).toBe(0);
    overlay.dispose();
  });
});