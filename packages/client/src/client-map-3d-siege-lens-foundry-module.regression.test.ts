import { describe, expect, it } from "vitest";
import { CylinderGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  SIEGE_LENS_BASE_RADIUS,
  SIEGE_LENS_MODULE_HEIGHT,
  SIEGE_LENS_SCALE,
  createSiegeLensFoundryModuleOverlay
} from "./client-map-3d-siege-lens-foundry-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

const lensCoreMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.02 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.012
  );

const seatBaseMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.1
  );

// The module's forward vector after yaw — the second matrix column. The lens
// piece points its local +Y along the module's +X forward axis (rotZ = -90°),
// so column 1 (elements 4/5/6) of the composed matrix maps to the module's
// forward direction.
const forwardAxis = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 4]!, a[o + 5]!, a[o + 6]!);
};

describe("siege lens foundry module overlay", () => {
  it("commits a fully assembled module with visible pieces and a lens core", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    const core = lensCoreMesh(scene);
    expect(core).toBeDefined();
    expect(core!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(SIEGE_LENS_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();
    overlay.clear();
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBe(0);
    expect(instancedMeshes(scene).length).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("does not allocate instance capacity proportional to per-module piece count", () => {
    // 32 pieces per module; caps sized to worst case stay under the 64MB
    // instanced-buffer budget even for absurd instance counts.
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× SIEGE_LENS_SCALE) above the
    // pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * SIEGE_LENS_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("aims the lens (forward +X) along the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 4);

    const azimuth = Math.PI / 3;
    overlay.addInstance(0, 0, 0, azimuth, 0, 0);
    overlay.commit();

    const core = lensCoreMesh(scene);
    expect(core).toBeDefined();
    const forward = forwardAxis(core!, 0).normalize();
    expect(forward.x).toBeCloseTo(Math.cos(azimuth), 6);
    expect(forward.y).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(Math.sin(azimuth), 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const core = lensCoreMesh(scene);
    expect(core).toBeDefined();
    const first = forwardAxis(core!, 0).normalize();
    const second = forwardAxis(core!, 1).normalize();
    expect(first.x).toBeCloseTo(1, 6);
    expect(second.z).toBeCloseTo(1, 6);
    expect(first.z).toBeCloseTo(0, 6);
    expect(second.x).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("breathes the lens core on update with a partial upload", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const core = lensCoreMesh(scene);
    expect(core).toBeDefined();
    expect(core!.count).toBe(1);

    const before = Array.from(core!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const after = Array.from(core!.instanceMatrix.array.slice(0, 16));

    expect(after).not.toEqual(before);
    const ranges = core!.instanceMatrix.updateRanges;
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.count).toBe(core!.count * 16);
    expect(ranges[0]!.count).toBeLessThan(core!.instanceMatrix.array.length);
    expect(core!.instanceMatrix.version).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("assembles a readable siege-lens silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The large focusing assembly: three concentric ring bands + aperture tip.
    const rings = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.062);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.count).toBe(1);

    // The oversized lens barrel reads as the dominant feature: front optic
    // glass + emissive beam chamber beyond the housing.
    const optics = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && geo.parameters.radiusTop === 0.05);
    expect(optics).toHaveLength(1);

    // Two flanking manipulator clamps each hold a lens blank.
    const blanks = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && geo.parameters.radiusTop === 0.016);
    expect(blanks).toHaveLength(1);
    expect(blanks[0]!.count).toBe(2);

    // A dock-scaled module that stays compact: ~0.33 tall (0.248 × 1.33).
    expect(SIEGE_LENS_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes directional rods and cables to their intended length along the cylinder axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction. If the length is applied to the wrong scale slot, each rod
    // keeps the full cylinder height (1 world unit) and squashes sideways —
    // visible as long black slabs sticking out of the module.
    const scene = new Scene();
    const overlay = createSiegeLensFoundryModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      // [radiusTop of the directional-piece geometry, intended rod length]
      [0.01, 0.052], // clampUpper arm segments (both flanks)
      [0.008, 0.052], // clampLower
      [0.0065, 0.03], // clampFinger
      [0.009, 0.081] // power coupling cables
    ];

    for (const [radiusTop, len] of expectedLengths) {
      const meshes = meshByGeometry(
        scene,
        (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === radiusTop
      );
      expect(meshes.length).toBeGreaterThan(0);
      for (const mesh of meshes) {
        expect(mesh.count).toBeGreaterThan(0);
        for (let i = 0; i < mesh.count; i += 1) {
          const axis = forwardAxis(mesh, i);
          expect(axis.length()).toBeCloseTo(len * SIEGE_LENS_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});