import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  AETHER_CORE_BASE_RADIUS,
  AETHER_CORE_MODULE_HEIGHT,
  AETHER_CORE_SCALE,
  createAetherResonanceModuleOverlay
} from "./client-map-3d-aether-resonance-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The glowing cyan resonance core disc — the module's defining feature.
const coreMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.04 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.035
  );

// The heavy brass frame ring that seats the core.
const frameRingMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "TorusGeometry" &&
      (mesh.geometry as TorusGeometry).parameters.radius === 0.055
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

describe("aether resonance core overlay", () => {
  it("commits a fully assembled module with a glowing resonance core and induction coils", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The defining feature: the bright cyan core disc, one per instance.
    const core = coreMesh(scene);
    expect(core).toBeDefined();
    expect(core!.count).toBe(2);

    // The rounded pod body is the dominant base form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(AETHER_CORE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 1);

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
    const overlay = createAetherResonanceModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× AETHER_CORE_SCALE) above the
    // pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * AETHER_CORE_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the forward core frame around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const frame = frameRingMesh(scene);
    expect(frame).toBeDefined();
    // The core frame sits at module-local (0.092, 0.16, 0); yaw π/2 swings that
    // +X offset to +Z. Heights also grow with the module scale.
    expect(frame!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(frame!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.16 * AETHER_CORE_SCALE, 6);
    expect(frame!.instanceMatrix.array[14]!).toBeCloseTo(0.092 * AETHER_CORE_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const frame = frameRingMesh(scene);
    expect(frame).toBeDefined();
    expect(frame!.count).toBe(2);
    const a = frame!.instanceMatrix.array;
    // Instance 0 yaw 0: the +X core offset stays on +X.
    expect(a[12]!).toBeCloseTo(0.092 * AETHER_CORE_SCALE, 6);
    expect(a[13]!).toBeCloseTo(0.16 * AETHER_CORE_SCALE, 6);
    expect(a[14]!).toBeCloseTo(0, 6);
    // Instance 1 yaw π/2: the same +X offset swings onto +Z.
    expect(a[28]!).toBeCloseTo(0, 6);
    expect(a[30]!).toBeCloseTo(0.092 * AETHER_CORE_SCALE, 6);

    overlay.dispose();
  });

  it("keeps the resonance core and frame static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const core = coreMesh(scene);
    expect(core).toBeDefined();
    expect(core!.count).toBe(1);

    const coresBefore = Array.from(core!.instanceMatrix.array.slice(0, 16));
    const coresVersionBefore = core!.instanceMatrix.version;
    const frame = frameRingMesh(scene);
    expect(frame).toBeDefined();
    const framesBefore = Array.from(frame!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const coresAfter = Array.from(core!.instanceMatrix.array.slice(0, 16));
    const framesAfter = Array.from(frame!.instanceMatrix.array.slice(0, 16));

    // The resonance cartridge idles without moving parts: update leaves every
    // matrix untouched and never re-uploads the instance buffers.
    expect(coresAfter).toEqual(coresBefore);
    expect(core!.instanceMatrix.version).toBe(coresVersionBefore);
    expect(framesAfter).toEqual(framesBefore);

    overlay.dispose();
  });

  it("assembles a readable core, frame and induction-coil silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The bright cyan resonance core disc, prominent in the upper half.
    const core = meshByGeometry(
      scene,
      (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 0.035 && geo.parameters.radiusTop === 0.04
    );
    expect(core).toHaveLength(1);
    expect(core[0]!.count).toBe(1);

    // The thick brass frame ring around the core, plus its steel backing ring.
    const frame = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.055 && geo.parameters.tube === 0.02);
    expect(frame).toHaveLength(1);
    expect(frame[0]!.count).toBe(1);
    const backing = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.048);
    expect(backing).toHaveLength(1);
    expect(backing[0]!.count).toBe(1);

    // Three large segmented induction-coil arcs around the core.
    const coils = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.082);
    expect(coils).toHaveLength(1);
    expect(coils[0]!.count).toBe(3);

    // The heavy rear AFC coupling: one thick steel stub per instance.
    const coupling = meshByGeometry(
      scene,
      (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.024
    );
    expect(coupling).toHaveLength(1);
    expect(coupling[0]!.count).toBe(1);

    // A module cartridge that never overgrows its dock: ~0.32 tall scaled.
    expect(AETHER_CORE_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes directional rods and the coupling to their intended length along the cylinder axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createAetherResonanceModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.012, 0.06], // flanking power conduits
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
          expect(axis.length()).toBeCloseTo(len * AETHER_CORE_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});