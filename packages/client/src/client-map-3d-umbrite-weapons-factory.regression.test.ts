import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createUmbriteWeaponsFactoryOverlay } from "./client-map-3d-umbrite-weapons-factory.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

describe("umbrite weapons factory overlay", () => {
  it("commits a fully assembled factory with visible pieces", () => {
    const scene = new Scene();
    const overlay = createUmbriteWeaponsFactoryOverlay(scene, 3);

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
    const overlay = createUmbriteWeaponsFactoryOverlay(scene, 1);

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
    // The factory emits 61 pieces per tile (hall, reactor, smokestacks,
    // pipes, press, ammo rack, storage and vein lumps); caps are sized to
    // that worst case and stay far under a 64MB budget even for a fully
    // stocked viewport.
    const scene = new Scene();
    const overlay = createUmbriteWeaponsFactoryOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    const scene = new Scene();
    const overlay = createUmbriteWeaponsFactoryOverlay(scene, 14_000);

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
});
