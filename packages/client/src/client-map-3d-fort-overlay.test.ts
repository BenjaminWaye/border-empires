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

// SIEGE_OUTPOST renders as a single armored siege machine (black-iron hull,
// brass trim, forward cannon, rotating aether targeting head) built by the
// dedicated client-map-3d-siege-machine-overlay.ts module and parented under
// a "siege-machine-overlay" group — not the old watchtower/catapult pieces.
describe("createFortOverlay siege outpost machine", () => {
  const MACHINE_GROUP = "siege-machine-overlay";

  const machineMeshes = (scene: Scene): InstancedMesh[] => {
    const group = scene.getObjectByName(MACHINE_GROUP);
    expect(group).toBeDefined();
    return group!.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
  };

  it("places a full 49-part machine with shadows for one SIEGE_OUTPOST instance", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "SIEGE_OUTPOST", "CLOSED", 5, 9);
    overlay.commit();
    const meshes = machineMeshes(scene);
    expect(meshes.length).toBeGreaterThan(0);
    const totalParts = meshes.reduce((total, mesh) => total + mesh.count, 0);
    expect(totalParts).toBe(49); // one instance = one full machine
    for (const mesh of meshes) {
      expect(mesh.count).toBeGreaterThanOrEqual(1);
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    }
    overlay.dispose();
    expect(scene.getObjectByName(MACHINE_GROUP)).toBeUndefined();
  });

  it("spins the aether head on tick() and leaves the static hull parked", () => {
    const scene = new Scene();
    const overlay = createFortOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "SIEGE_OUTPOST", "CLOSED", 1, 2);
    overlay.commit();
    const headMesh = scene.getObjectByName("siege-headRing:violet") as InstancedMesh | undefined;
    const hullMesh = scene.getObjectByName("siege-box:darkIron") as InstancedMesh | undefined;
    expect(headMesh).toBeDefined();
    expect(hullMesh).toBeDefined();
    const beforeHead = new Float32Array(headMesh!.instanceMatrix.array);
    const beforeHull = new Float32Array(hullMesh!.instanceMatrix.array);
    overlay.tick(1000);
    expect(new Float32Array(headMesh!.instanceMatrix.array)).not.toEqual(beforeHead);
    expect(new Float32Array(hullMesh!.instanceMatrix.array)).toEqual(beforeHull);
    overlay.dispose();
  });
});