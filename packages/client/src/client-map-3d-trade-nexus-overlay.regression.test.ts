import { describe, expect, it } from "vitest";
import { BoxGeometry, CylinderGeometry, InstancedMesh, Scene } from "three";
import { createTradeNexusOverlay } from "./client-map-3d-trade-nexus-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const sealSpokeMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "BoxGeometry" &&
      (mesh.geometry as BoxGeometry).parameters.width === 0.09
  );

const sealGearMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.02 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.028
  );

describe("trade nexus overlay", () => {
  it("commits a fully assembled nexus with visible pieces", () => {
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 3);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(2, 0, 0, 1, 0);
    overlay.addInstance(4, 0, 0, 2, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    overlay.clear();
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("does not allocate instance capacity proportional to per-tile piece count", () => {
    // The nexus emits ~69 pieces per tile (plaza, six converging roads,
    // domed hall, clockwork seal spokes/gears, warehouses, cranes, pipes and
    // lamps); caps honor that worst case and stay under a 64MB budget even
    // for a fully-rigged viewport.
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 5, 5);
    overlay.commit();

    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    for (const mesh of drawn) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, count: mesh.count * 16 });
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
    }

    overlay.dispose();
  });

  it("keeps draw calls constant as nexuses are added (instancing)", () => {
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 8);

    const emptySlotCount = instancedMeshes(scene).length;
    expect(emptySlotCount).toBeGreaterThan(0);

    for (let i = 0; i < 6; i += 1) overlay.addInstance(i * 2, 0, 0, i, 0);
    overlay.commit();

    // One InstancedMesh per slot; adding nexuses adds instances, not meshes.
    expect(instancedMeshes(scene).length).toBe(emptySlotCount);

    overlay.dispose();
  });

  it("animates with a partial instance upload, not a full-buffer rewrite", () => {
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 2, 4);
    overlay.commit();
    overlay.update(500);

    const spokes = sealSpokeMesh(scene);
    const gears = sealGearMesh(scene);
    expect(spokes).toBeDefined();
    expect(gears).toBeDefined();
    expect(spokes!.count).toBe(4);
    expect(gears!.count).toBe(4);

    // update() marks only the used prefix dirty (partial upload) so the GPU
    // re-uploads 4*16 floats per nexus per seal-disk, not the whole cap.
    for (const mesh of [spokes!, gears!]) {
      const ranges = mesh.instanceMatrix.updateRanges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]!.count).toBe(mesh.count * 16);
      expect(ranges[0]!.count).toBeLessThan(mesh.instanceMatrix.array.length);
      expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
    }

    overlay.dispose();
  });

  it("spins the clockwork seal on update without disturbing instance counts", () => {
    const scene = new Scene();
    const overlay = createTradeNexusOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 3, 7);
    overlay.addInstance(2, 0, 0, 11, 1);
    overlay.commit();

    const spokes = sealSpokeMesh(scene);
    const gears = sealGearMesh(scene);
    expect(spokes).toBeDefined();
    expect(gears).toBeDefined();
    expect(spokes!.count).toBe(8);
    expect(gears!.count).toBe(8);

    const before = Array.from(spokes!.instanceMatrix.array.slice(0, 16));
    const gearBefore = Array.from(gears!.instanceMatrix.array.slice(0, 16));

    overlay.update(1000);

    const after = Array.from(spokes!.instanceMatrix.array.slice(0, 16));
    const gearAfter = Array.from(gears!.instanceMatrix.array.slice(0, 16));
    expect(after).not.toEqual(before);
    expect(gearAfter).not.toEqual(gearBefore);

    // Two nexuses on different tiles rotate out of phase, so their first
    // seal spokes are never in the same pose.
    const nexusOne = Array.from(spokes!.instanceMatrix.array.slice(0, 16));
    const nexusTwo = Array.from(spokes!.instanceMatrix.array.slice(16, 32));
    expect(nexusOne).not.toEqual(nexusTwo);

    expect(spokes!.count).toBe(8);
    expect(gears!.count).toBe(8);

    overlay.dispose();
  });
});