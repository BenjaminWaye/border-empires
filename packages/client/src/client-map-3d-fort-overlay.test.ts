import { describe, expect, it } from "vitest";
import { InstancedMesh, MeshStandardMaterial, Scene } from "three";
import { createFortOverlay } from "./client-map-3d-fort-overlay.js";

const instancedMeshesIn = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

// Regression for a live bug: createFortOverlay's addInstance only emitted
// FORT / WOODEN_FORT / SIEGE_OUTPOST pieces, so a built Titanium or Thunder
// Bastion went completely unrendered on the 3D map even though the tile state
// had the active structure. Each handled fort variant must draw its own
// wall/tower silhouette (closed = 4 walls + 4 towers; a gate omits 1 wall).
describe("createFortOverlay variant wiring", () => {
  it("draws TITANIUM_BASTION and THUNDER_BASTION pieces instead of dropping them", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "TITANIUM_BASTION", "CLOSED");
    overlay.addInstance(2, 0, 0, "THUNDER_BASTION", "NORTH");
    overlay.commit();
    const pieces = instancedMeshesIn(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(pieces).toBe(8 + 7);
    overlay.dispose();
  });

  it("renders bastions with their own metal meshes, not the stone or wood fort meshes", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "TITANIUM_BASTION", "CLOSED");
    overlay.addInstance(2, 0, 0, "THUNDER_BASTION", "CLOSED");
    overlay.commit();
    const rendered = instancedMeshesIn(scene).filter((mesh) => mesh.count > 0);
    expect(rendered.length).toBeGreaterThan(0);
    for (const mesh of rendered) {
      const color = (mesh.material as MeshStandardMaterial).color.getHexString();
      expect(color).not.toBe("aea99c"); // stone fort wall/tower
      expect(color).not.toBe("8a6a47"); // wooden fort wall/tower
    }
    overlay.dispose();
  });
});