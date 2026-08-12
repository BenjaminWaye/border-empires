import { describe, expect, it } from "vitest";
import { InstancedMesh, Object3D, Scene } from "three";
import { createDockOverlay } from "./client-map-3d-dock-overlay.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] => {
  const meshes: InstancedMesh[] = [];
  const visit = (children: unknown[]): void => {
    for (const child of children) {
      if (child instanceof InstancedMesh) meshes.push(child);
      else if (child instanceof Object3D) visit(child.children);
    }
  };
  visit(scene.children);
  return meshes;
};

const renderedPieces = (scene: Scene): number =>
  instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);

describe("dock overlay", () => {
  it("commits a fully assembled dock with the crane, pier, cargo and barge", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // One tile must emit the whole working scene (64 parts grouped into 24 shared
    // (geometry, material) slots): pier + dockhouse + crane rig + winch + cargo +
    // barge + lamps. A change that drops any part (say the suspended crate or the
    // barge) changes this total and must be reviewed here.
    const meshes = instancedMeshes(scene);
    expect(renderedPieces(scene)).toBe(64);
    expect(meshes).toHaveLength(24);
    // No dead slots: every shared slot must actually draw on a single tile.
    for (const mesh of meshes) expect(mesh.count).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("renders every dock in a multi-dock frame completely", () => {
    // Regression for the storybook Row view: per-slot capacity is maxTiles *
    // parts-per-tile, so placing several docks in one commit must not drop the
    // parts of docks after the first (a single maxTiles-sized pool would only
    // fit one dock's worth of planks/piles/barge/crane).
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 4);

    for (let i = 0; i < 4; i += 1) overlay.addInstance(i * 1.4, 0, 0, 0, i, 0);
    overlay.commit();

    expect(renderedPieces(scene)).toBe(4 * 64);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    expect(renderedPieces(scene)).toBeGreaterThan(0);

    overlay.clear();
    overlay.commit();
    expect(renderedPieces(scene)).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("sizes instance capacity to maxTiles * parts-per-tile, under the old dock", () => {
    // The old overlay reserved maxTiles * 12 instances per mesh (≈64.5MB at the
    // 14k budget). This overlay reserves exactly the parts each dock emits per
    // slot — 64 parts per dock in total — so preallocation is strictly lower
    // while a full screen of dock tiles can never drop parts.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 14_000);

    expect(instancedMeshes(scene).length).toBe(24);
    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    const partsPerDock = 64;
    const bytesPerPart = 16 * 4;
    expect(totalBytes).toBe(14_000 * partsPerDock * bytesPerPart);
    expect(totalBytes).toBeLessThan(14_000 * 72 * bytesPerPart);

    overlay.dispose();
  });

  it("uploads only the instances actually used, not the whole buffer", () => {
    // Without an update range three.js does gl.bufferSubData(target, 0, array) — the entire
    // capacity — every time needsUpdate is set, however few instances are drawn.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 14_000);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
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

  it("re-uploads the used range on every commit so a swapped dock is never stale", () => {
    // commit() only runs when the visible tile set changed. A dock leaving and
    // another entering keeps the per-slot instance counts identical, so a
    // "count unchanged" skip would leave the previous dock's matrices on the
    // GPU. Every commit must re-mark the used range for upload (three r179
    // re-uploads when the setter-only needsUpdate bumps the attribute's
    // `version`).
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    const versionsAfterFirst = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (const version of versionsAfterFirst) expect(version).toBeGreaterThan(0);

    // Same number of docks, different tile (per-slot counts unchanged): the
    // matrices were re-written, so the upload must be marked again, not skipped.
    overlay.clear();
    overlay.addInstance(1, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();
    const versionsAfterSwap = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (let i = 0; i < versionsAfterFirst.length; i += 1) {
      expect(versionsAfterSwap[i]!).toBeGreaterThan(versionsAfterFirst[i]!);
    }

    overlay.dispose();
  });
});
