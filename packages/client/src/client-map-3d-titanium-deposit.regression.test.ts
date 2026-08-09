import { describe, expect, it } from "vitest";
import { InstancedMesh, Scene } from "three";
import { createTitaniumDepositOverlay, titaniumDepositVariantAt } from "./client-map-3d-titanium-deposit.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

describe("titanium deposit overlay", () => {
  it("picks only variants 0/1/2 across a sample of tiles", () => {
    for (let x = 0; x < 200; x += 1) {
      for (let z = 0; z < 200; z += 1) {
        const v = titaniumDepositVariantAt(x, z);
        expect([0, 1, 2]).toContain(v);
      }
    }
  });

  it("commits visible pieces for every variant", () => {
    const scene = new Scene();
    const overlay = createTitaniumDepositOverlay(scene, 3);

    for (let i = 0; i < 3; i += 1) {
      overlay.addInstance(i * 2, 0, 0, i, 0);
    }
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createTitaniumDepositOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    overlay.clear();
    overlay.commit();

    const renderedPieces = scene.children
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh)
      .reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBe(0);
    expect(scene.children.filter((child) => child instanceof InstancedMesh).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("does not allocate instance capacity proportional to per-tile piece count", () => {
    // Regression guard for the GPU blowup: caps were sized maxTiles * 49 total (incl. a
    // never-drawn "plate" slot), reserving ~44 MB of CPU/VRAM for a sparse resource. Caps
    // now match the worst-case pieces a single tile can emit (~31x maxTiles).
    const scene = new Scene();
    const overlay = createTitaniumDepositOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(32 * 1024 * 1024);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn.
    const scene = new Scene();
    const overlay = createTitaniumDepositOverlay(scene, 14_000);

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
