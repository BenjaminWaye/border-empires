import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  RIGGING_WORKS_BASE_RADIUS,
  RIGGING_WORKS_MODULE_HEIGHT,
  RIGGING_WORKS_SCALE,
  createRiggingWorksModuleOverlay
} from "./client-map-3d-rigging-works-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The drill barrel: a short fat auger (not a long mining drill) — the module's
// defining feature.
const drillBarrelMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.042 &&
      (mesh.geometry as CylinderGeometry).parameters.height === 0.085
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

describe("rigging works module overlay", () => {
  it("commits a fully assembled module with a short fat drill and chunky gearbox", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The defining feature: a short fat drill barrel, one per instance.
    const barrel = drillBarrelMesh(scene);
    expect(barrel).toBeDefined();
    expect(barrel!.count).toBe(2);

    // The module's two rounded housing forms: the pod body and the gearbox.
    const capsules = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(capsules).toHaveLength(2);
    expect(capsules[0]!.count).toBe(2);
    expect(capsules[1]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(RIGGING_WORKS_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 1);

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
    const overlay = createRiggingWorksModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× RIGGING_WORKS_SCALE) above
    // the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * RIGGING_WORKS_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the front-facing drill barrel around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const barrel = drillBarrelMesh(scene);
    expect(barrel).toBeDefined();
    // The drill barrel sits at module-local (0.105, 0.17, 0); yaw π/2 swings
    // that +X offset to +Z. Heights also grow with the module scale.
    expect(barrel!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(barrel!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.17 * RIGGING_WORKS_SCALE, 6);
    expect(barrel!.instanceMatrix.array[14]!).toBeCloseTo(0.105 * RIGGING_WORKS_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const barrel = drillBarrelMesh(scene);
    expect(barrel).toBeDefined();
    expect(barrel!.count).toBe(2);
    const a = barrel!.instanceMatrix.array;
    // Instance 0 yaw 0: the +X drill offset stays on +X.
    expect(a[12]!).toBeCloseTo(0.105 * RIGGING_WORKS_SCALE, 6);
    expect(a[13]!).toBeCloseTo(0.17 * RIGGING_WORKS_SCALE, 6);
    expect(a[14]!).toBeCloseTo(0, 6);
    // Instance 1 yaw π/2: the same +X offset swings onto +Z.
    expect(a[28]!).toBeCloseTo(0, 6);
    expect(a[30]!).toBeCloseTo(0.105 * RIGGING_WORKS_SCALE, 6);

    overlay.dispose();
  });

  it("keeps the drill barrel static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const barrel = drillBarrelMesh(scene);
    expect(barrel).toBeDefined();
    expect(barrel!.count).toBe(1);

    const before = Array.from(barrel!.instanceMatrix.array.slice(0, 16));
    const versionBefore = barrel!.instanceMatrix.version;
    overlay.update(1000);
    const after = Array.from(barrel!.instanceMatrix.array.slice(0, 16));

    // The auger cartridge idles without moving parts: update leaves every
    // drill matrix untouched and never re-uploads the instance buffer.
    expect(after).toEqual(before);
    expect(barrel!.instanceMatrix.version).toBe(versionBefore);

    overlay.dispose();
  });

  it("assembles a readable drill head, gearbox and cable drum silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The defining feature: one short fat drill barrel plus its conical bit.
    const barrel = meshByGeometry(
      scene,
      (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 0.085 && geo.parameters.radiusTop === 0.042
    );
    expect(barrel).toHaveLength(1);
    expect(barrel[0]!.count).toBe(1);
    const bit = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 0.034 && geo.parameters.radiusTop === 0.014);
    expect(bit).toHaveLength(1);
    expect(bit[0]!.count).toBe(1);

    // The chunky gearbox housing behind the drill, wrapped in brass rings,
    // with two heavy pistons braced onto the barrel.
    const gearbox = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry" && geo.parameters.radius === 0.042);
    expect(gearbox).toHaveLength(1);
    expect(gearbox[0]!.count).toBe(1);
    const driveRings = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.044 && geo.parameters.tube === 0.009);
    expect(driveRings).toHaveLength(1);
    expect(driveRings[0]!.count).toBe(2);
    const pistons = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.016);
    expect(pistons).toHaveLength(1);
    expect(pistons[0]!.count).toBe(2);

    // One winding drum on the flank: brass flanges + wound cable band.
    const flange = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.042);
    expect(flange).toHaveLength(1);
    expect(flange[0]!.count).toBe(1);
    const wrap = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.03);
    expect(wrap).toHaveLength(1);
    expect(wrap[0]!.count).toBe(1);

    // The restrained cyan detail: a single slim drive ring on the drill collar.
    const cyanRing = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.044 && geo.parameters.tube === 0.005);
    expect(cyanRing).toHaveLength(1);
    expect(cyanRing[0]!.count).toBe(1);

    // A module cartridge that never overgrows its dock: ~0.33 tall scaled.
    expect(RIGGING_WORKS_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes directional rods and support struts to their intended length along the cylinder axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createRiggingWorksModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.016, 0.082], // heavy gearbox pistons
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
          expect(axis.length()).toBeCloseTo(len * RIGGING_WORKS_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});