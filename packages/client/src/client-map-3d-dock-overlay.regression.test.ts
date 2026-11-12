import { describe, expect, it } from "vitest";
import { Box3, InstancedMesh, Matrix4, Object3D, Scene, Vector3 } from "three";
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

const piece = (scene: Scene, kind: "quay" | "slipway" | "shrunkSlipway"): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => mesh.name.startsWith(`dock-${kind}-`));

const triangles = (meshes: readonly InstancedMesh[]): number =>
  meshes.reduce((total, mesh) => total + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);

const bounds = (meshes: readonly InstancedMesh[]): Box3 => {
  const box = new Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!);
  }
  return box;
};

describe("dock overlay", () => {
  it("draws a placed quay as one instance on every quay material mesh, and nothing else", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const quay = piece(scene, "quay");
    expect(quay.length).toBeGreaterThan(8);
    for (const mesh of quay) expect(mesh.count).toBe(1);
    for (const mesh of [...piece(scene, "slipway"), ...piece(scene, "shrunkSlipway")]) expect(mesh.count).toBe(0);
    // The detailed model: a regression to the old few-dozen-box quay shows up here.
    expect(triangles(quay)).toBeGreaterThan(3000);
    // Stays on its tile (the pier and moored carrier reach just past the sea edge).
    const box = bounds(quay);
    expect(box.min.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.max.x).toBeLessThanOrEqual(0.5);
    expect(box.min.z).toBeGreaterThanOrEqual(-0.5);
    expect(box.max.z).toBeLessThanOrEqual(0.62);

    overlay.dispose();
  });

  it("draws a full landing slipway, or the smaller shrunk one, never both", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addSlipway(0, 0, 0, 0, "full");
    overlay.commit();
    for (const mesh of piece(scene, "slipway")) expect(mesh.count).toBe(1);
    for (const mesh of piece(scene, "shrunkSlipway")) expect(mesh.count).toBe(0);

    overlay.clear();
    overlay.addSlipway(0, 0, 0, 0, "shrunk");
    overlay.commit();
    for (const mesh of piece(scene, "slipway")) expect(mesh.count).toBe(0);
    for (const mesh of piece(scene, "shrunkSlipway")) expect(mesh.count).toBe(1);
    // The shrunk slipway keeps only the ramp and barge.
    expect(triangles(piece(scene, "shrunkSlipway"))).toBeLessThan(triangles(piece(scene, "slipway")));

    overlay.dispose();
  });

  it("pushes a shrunk slipway out to the waterline, toward the sea it faces", () => {
    // Shrunk, the ramp sits further toward the water (+z here) so it clears the tile's other structure.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 10);
    expect(bounds(piece(scene, "shrunkSlipway")).min.z).toBeGreaterThan(bounds(piece(scene, "slipway")).min.z);
    overlay.dispose();
  });

  it("renders every harbour piece in a multi-dock frame completely", () => {
    // Regression for the storybook Row view: placing several pieces in one
    // commit must not drop the pieces after the first.
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 4);

    for (let i = 0; i < 2; i += 1) overlay.addInstance(i * 1.4, 0, 0, 0, i, 0);
    for (let i = 0; i < 2; i += 1) overlay.addSlipway(i * 1.4, 1, 0, 0, "full");
    overlay.commit();

    for (const mesh of [...piece(scene, "quay"), ...piece(scene, "slipway")]) expect(mesh.count).toBe(2);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    expect(instancedMeshes(scene).some((mesh) => mesh.count > 0)).toBe(true);

    overlay.clear();
    overlay.commit();
    expect(instancedMeshes(scene).every((mesh) => mesh.count === 0)).toBe(true);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("reserves maxTiles placements per mesh, under the old dock's 64 matrices per tile", () => {
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 14_000);

    const meshes = instancedMeshes(scene);
    const totalBytes = meshes.reduce((total, mesh) => total + mesh.instanceMatrix.array.length * 4, 0);
    expect(totalBytes).toBe(14_000 * meshes.length * 16 * 4);
    expect(meshes.length).toBeLessThanOrEqual(64);

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

  it("rotates the whole dock exactly once around the tile center", () => {
    // Regression: addInstance used to pre-rotate the part position AND then
    // multiply by the outer rotation matrix, so positions rotated twice while
    // orientations rotated once — every dock that faced a non-zero direction
    // came out garbled. A model point (the control office door, at
    // (-0.24, 0.165, -0.117)) must land at centre + RY(rot) * that offset;
    // the centre itself is the tile's world position and is never rotated.
    const doorAt = (centerX: number, centerZ: number, rotationY: number): number[] => {
      const scene = new Scene();
      const overlay = createDockOverlay(scene, 100);
      overlay.addInstance(centerX, centerZ, 0, rotationY, 0, 0);
      overlay.commit();
      const matrix = new Matrix4();
      piece(scene, "quay")[0]!.getMatrixAt(0, matrix);
      overlay.dispose();
      return new Vector3(-0.24, 0.165, -0.117).applyMatrix4(matrix).toArray().map((v) => Math.round(v * 1000));
    };

    // RY(90deg) faces the quay east: local (x, z) -> (z, -x), so the door at the back lands on the inland (west) side.
    expect(doorAt(0, 0, Math.PI / 2)).toEqual([-117, 165, 240]);
    // RY(180deg): (x, z) -> (-x, -z)
    expect(doorAt(0, 0, Math.PI)).toEqual([240, 165, 117]);
    // Off-centre tile: only the local offset rotates; the centre translates untouched.
    expect(doorAt(10, -4, Math.PI / 2)).toEqual([9883, 165, -3760]);
  });

  it("re-uploads the used range on every commit so a swapped dock is never stale", () => {
    // commit() only runs when the visible tile set changed. A dock leaving and
    // another entering keeps the instance counts identical, so a "count
    // unchanged" skip would leave the previous dock's matrices on the GPU.
    // Every commit must re-mark the used range for upload (three r179
    // re-uploads when the setter-only needsUpdate bumps the attribute's `version`).
    const scene = new Scene();
    const overlay = createDockOverlay(scene, 100);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    const drawn = instancedMeshes(scene).filter((mesh) => mesh.count > 0);
    expect(drawn.length).toBeGreaterThan(0);
    const versionsAfterFirst = drawn.map((mesh) => mesh.instanceMatrix.version);
    for (const version of versionsAfterFirst) expect(version).toBeGreaterThan(0);

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
