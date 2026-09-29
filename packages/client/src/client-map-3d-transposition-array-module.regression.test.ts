import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  TRANSPOSITION_ARRAY_BASE_RADIUS,
  TRANSPOSITION_ARRAY_MODULE_HEIGHT,
  TRANSPOSITION_ARRAY_SCALE,
  createTranspositionArrayModuleOverlay
} from "./client-map-3d-transposition-array-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The bright cyan energy channel suspended between the pair of transfer rings.
const energyColumnMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.026 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 1
  );

// The brass transfer rings (the module's defining feature), radius 0.056.
const transferRingMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "TorusGeometry" &&
      (mesh.geometry as TorusGeometry).parameters.radius === 0.056 &&
      (mesh.geometry as TorusGeometry).parameters.tube === 0.02
  );

const seatBaseMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.1
  );

// The module's local axis after yaw — the second matrix column. Rods and
// plates align their local +Y along the piece direction, so column 1
// (elements 4/5/6) reads the piece's scaled axis.
const yAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 4]!, a[o + 5]!, a[o + 6]!);
};

describe("transposition array overlay", () => {
  it("commits a fully assembled module with a pair of transfer rings and an energy channel", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The defining feature: two brass transfer rings per instance (a pair,
    // one slightly above the other) plus the suspended energy channel.
    const rings = transferRingMesh(scene);
    expect(rings).toBeDefined();
    expect(rings!.count).toBe(4);
    const energy = energyColumnMesh(scene);
    expect(energy).toBeDefined();
    expect(energy!.count).toBe(2);

    // The rounded pod body is the dominant base form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(TRANSPOSITION_ARRAY_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 1);

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
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× TRANSPOSITION_ARRAY_SCALE)
    // above the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * TRANSPOSITION_ARRAY_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the opposed transfer rings around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const rings = transferRingMesh(scene);
    expect(rings).toBeDefined();
    // The lower ring sits at module-local (0.098, 0.114, 0); yaw π/2 swings
    // that +X offset to +Z. Heights also grow with the module scale.
    expect(rings!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(rings!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.114 * TRANSPOSITION_ARRAY_SCALE, 6);
    expect(rings!.instanceMatrix.array[14]!).toBeCloseTo(0.098 * TRANSPOSITION_ARRAY_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const rings = transferRingMesh(scene);
    expect(rings).toBeDefined();
    expect(rings!.count).toBe(4);
    const a = rings!.instanceMatrix.array;
    // Instance 0 yaw 0 (first ring of the pair): the +X lower-ring offset
    // stays on +X.
    expect(a[12]!).toBeCloseTo(0.098 * TRANSPOSITION_ARRAY_SCALE, 6);
    expect(a[13]!).toBeCloseTo(0.114 * TRANSPOSITION_ARRAY_SCALE, 6);
    expect(a[14]!).toBeCloseTo(0, 6);
    // Instance 1 yaw π/2 (first ring of its pair at instance index 2): the
    // same +X offset swings onto +Z.
    expect(a[44]!).toBeCloseTo(0, 6);
    expect(a[46]!).toBeCloseTo(0.098 * TRANSPOSITION_ARRAY_SCALE, 6);

    overlay.dispose();
  });

  it("keeps the transfer array static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const energy = energyColumnMesh(scene);
    expect(energy).toBeDefined();
    expect(energy!.count).toBe(1);

    const energyBefore = Array.from(energy!.instanceMatrix.array.slice(0, 16));
    const energyVersionBefore = energy!.instanceMatrix.version;
    const rings = transferRingMesh(scene);
    expect(rings).toBeDefined();
    const ringsBefore = Array.from(rings!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const energyAfter = Array.from(energy!.instanceMatrix.array.slice(0, 16));
    const ringsAfter = Array.from(rings!.instanceMatrix.array.slice(0, 16));

    // The transposition cartridge idles without moving parts: update leaves
    // every matrix untouched and never re-uploads the instance buffers.
    expect(energyAfter).toEqual(energyBefore);
    expect(energy!.instanceMatrix.version).toBe(energyVersionBefore);
    expect(ringsAfter).toEqual(ringsBefore);

    overlay.dispose();
  });

  it("assembles a readable ring-pair, energy channel and rear coupling silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The pair of opposed transfer rings, both visible from the front.
    const rings = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.056 && geo.parameters.tube === 0.02);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.count).toBe(2);

    // The bright energy column suspended between them, plus its brighter core.
    const column = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.026);
    expect(column).toHaveLength(1);
    expect(column[0]!.count).toBe(1);
    const columnCore = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.013);
    expect(columnCore).toHaveLength(1);
    expect(columnCore[0]!.count).toBe(1);

    // Two thick curved conduits feeding from the rings into the body.
    const conduits = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.05 && geo.parameters.tube === 0.024);
    expect(conduits).toHaveLength(1);
    expect(conduits[0]!.count).toBe(2);

    // The heavy rear AFC coupling: one thick steel stub per instance.
    const coupling = meshByGeometry(
      scene,
      (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.024
    );
    expect(coupling).toHaveLength(1);
    expect(coupling[0]!.count).toBe(1);

    // A module cartridge that never overgrows its dock: ~0.34 tall scaled.
    expect(TRANSPOSITION_ARRAY_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes directional rods and the coupling to their intended length along the cylinder axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.026, 0.07], // suspended energy channel
      [0.013, 0.07], // energy channel core
      [0.024, 0.05] // heavy rear coupling stub
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
          const axis = yAxisColumn(mesh, i);
          expect(axis.length()).toBeCloseTo(len * TRANSPOSITION_ARRAY_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});