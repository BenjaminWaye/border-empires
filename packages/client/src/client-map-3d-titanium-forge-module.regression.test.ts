import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  TITANIUM_FORGE_BASE_RADIUS,
  TITANIUM_FORGE_MODULE_HEIGHT,
  TITANIUM_FORGE_SCALE,
  createTitaniumForgeModuleOverlay
} from "./client-map-3d-titanium-forge-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

const forgeHotMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.032
  );

const pressRamMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.03 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.05
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

describe("titanium forge module overlay", () => {
  it("commits a fully assembled module with a glowing forge bowl and press ram", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    const hot = forgeHotMesh(scene);
    expect(hot).toBeDefined();
    expect(hot!.count).toBe(2);

    const ram = pressRamMesh(scene);
    expect(ram).toBeDefined();
    expect(ram!.count).toBe(2);

    // The rounded pod body is the dominant form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(TITANIUM_FORGE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 1);

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
    const overlay = createTitaniumForgeModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× TITANIUM_FORGE_SCALE) above
    // the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * TITANIUM_FORGE_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the front-offset press ram around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const ram = pressRamMesh(scene);
    expect(ram).toBeDefined();
    // Ram sits at module-local (0.05, 0.221, 0); yaw π/2 swings that +X offset
    // to +Z. Heights also grow with the module scale.
    expect(ram!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(ram!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.221 * TITANIUM_FORGE_SCALE, 6);
    expect(ram!.instanceMatrix.array[14]!).toBeCloseTo(0.05 * TITANIUM_FORGE_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const ram = pressRamMesh(scene);
    expect(ram).toBeDefined();
    expect(ram!.count).toBe(2);
    const a = ram!.instanceMatrix.array;
    // Instance 0 yaw 0: the +X front offset stays on +X.
    expect(a[12]!).toBeCloseTo(0.05 * TITANIUM_FORGE_SCALE, 6);
    expect(a[13]!).toBeCloseTo(0.221 * TITANIUM_FORGE_SCALE, 6);
    expect(a[14]!).toBeCloseTo(0, 6);
    // Instance 1 yaw π/2: the same +X offset swings onto +Z.
    expect(a[28]!).toBeCloseTo(0, 6);
    expect(a[30]!).toBeCloseTo(0.05 * TITANIUM_FORGE_SCALE, 6);

    overlay.dispose();
  });

  it("pulses the forge bowl on update with a partial upload", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const hot = forgeHotMesh(scene);
    expect(hot).toBeDefined();
    expect(hot!.count).toBe(1);

    const before = Array.from(hot!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const after = Array.from(hot!.instanceMatrix.array.slice(0, 16));

    expect(after).not.toEqual(before);
    const ranges = hot!.instanceMatrix.updateRanges;
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.count).toBe(hot!.count * 16);
    expect(ranges[0]!.count).toBeLessThan(hot!.instanceMatrix.array.length);
    expect(hot!.instanceMatrix.version).toBeGreaterThan(0);

    overlay.dispose();
  });

  it("assembles a readable forge silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The large exposed forge mouth: one thick brass ring around the opening.
    const mouth = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.055);
    expect(mouth).toHaveLength(1);
    expect(mouth[0]!.count).toBe(1);

    // Six radial reinforcement ribs around the chamber.
    const ribs = meshByGeometry(
      scene,
      (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.012
    );
    expect(ribs).toHaveLength(1);
    expect(ribs[0]!.count).toBe(6);

    // Two compression jaws working the bowl.
    const jaws = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && geo.parameters.radiusTop === 0.017);
    expect(jaws).toHaveLength(1);
    expect(jaws[0]!.count).toBe(2);

    // A module cartridge that never overgrows its dock: ~0.33 tall scaled.
    expect(TITANIUM_FORGE_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes directional rods and braces to their intended length along the cylinder axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createTitaniumForgeModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.012, 0.038], // reinforcement ribs
      [0.014, 0.092], // side braces
      [0.017, 0.059], // compression jaws
      [0.018, 0.034] // AFC power connector stub
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
          expect(axis.length()).toBeCloseTo(len * TITANIUM_FORGE_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});