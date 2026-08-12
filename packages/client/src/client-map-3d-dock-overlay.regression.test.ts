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

  it("does not allocate instance capacity proportional to per-tile piece count", () => {
    // Regression guard for the GPU blowup that plagued other overlays: pools are
    // sized at maxTiles per shared (geometry, material) slot, not maxTiles * 63
    // (the per-tile part count), which would have reserved ~56 MB for a sparse
    // coastal feature. 24 shared slots stay inside the renderer's preallocation
    // budget (~40 InstancedMeshes at budget count).
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 14_000);

    expect(instancedMeshes(scene).length).toBe(24);
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

  it("skips instance-matrix uploads when the frame is unchanged", () => {
    // Docks are static terrain. commit() runs every frame; it must not re-upload
    // matrices when no tile entered or left the view. three.js r179 exposes
    // needsUpdate as setter-only and re-uploads when the attribute's `version`
    // increases, so an unchanged commit must leave `version` untouched (zero GPU
    // work) while a changed frame must bump it.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    const afterFirstCommit = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (const version of afterFirstCommit) expect(version).toBeGreaterThan(0);

    // No tile change between frames: nothing may be re-marked for upload.
    overlay.commit();
    expect(drawn.map((mesh) => mesh.instanceMatrix.version)).toEqual(afterFirstCommit);

    // A later tile change must still trigger an upload.
    overlay.addInstance(3, 0, 0, Math.PI / 2, 3, 0);
    overlay.commit();
    const afterChange = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (let i = 0; i < afterFirstCommit.length; i += 1) {
      expect(afterChange[i]!).toBeGreaterThan(afterFirstCommit[i]!);
    }

    overlay.dispose();
  });
});
