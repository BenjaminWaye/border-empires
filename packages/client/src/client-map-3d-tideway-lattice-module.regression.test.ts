import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  TIDEWAY_LATTICE_BASE_RADIUS,
  TIDEWAY_LATTICE_MODULE_HEIGHT,
  TIDEWAY_LATTICE_SCALE,
  createTidewayLatticeModuleOverlay
} from "./client-map-3d-tideway-lattice-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The defining feature: the two large parallel arch-shaped emitters — half-torus
// gateways swept 180°, radius 0.098, tube 0.016, standing on the pod's X–Y plane.
const archMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "TorusGeometry" &&
      (mesh.geometry as TorusGeometry).parameters.radius === 0.098 &&
      (mesh.geometry as TorusGeometry).parameters.tube === 0.016 &&
      (mesh.geometry as TorusGeometry).parameters.arc === Math.PI
  );

// The bright cyan lattice deck that spans the gap between the arches (three
// bridge-deck rails plus a cross tie) — thin emissive cylinders.
const deckBarMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height === 1 &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.012
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

describe("tideway lattice overlay", () => {
  it("commits a fully assembled module with twin arches and a cyan lattice span", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The defining feature: two parallel arch emitters per instance, with a
    // bright cyan lattice deck between them.
    const arches = archMesh(scene);
    expect(arches).toBeDefined();
    expect(arches!.count).toBe(4);
    const bars = deckBarMesh(scene);
    expect(bars).toBeDefined();
    expect(bars!.count).toBe(6);

    // The rounded pod body is the dominant base form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(TIDEWAY_LATTICE_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 1);

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
    const overlay = createTidewayLatticeModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× TIDEWAY_LATTICE_SCALE) above
    // the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * TIDEWAY_LATTICE_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the lattice span around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const bars = deckBarMesh(scene);
    expect(bars).toBeDefined();
    // The third deck rail (instance 2) sits at module-local (0.05, 0.22, 0)
    // above the pod crown; yaw π/2 swings that +X offset to +Z. Heights also
    // grow with scale.
    expect(bars!.count).toBe(3);
    expect(bars!.instanceMatrix.array[44]!).toBeCloseTo(0, 6);
    expect(bars!.instanceMatrix.array[45]!).toBeCloseTo(2 + 0.22 * TIDEWAY_LATTICE_SCALE, 6);
    expect(bars!.instanceMatrix.array[46]!).toBeCloseTo(0.05 * TIDEWAY_LATTICE_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const bars = deckBarMesh(scene);
    expect(bars).toBeDefined();
    expect(bars!.count).toBe(6);
    const a = bars!.instanceMatrix.array;
    // Instance 2 (module 0's outward deck rail) at yaw 0 keeps its +X offset.
    expect(a[32 + 12]!).toBeCloseTo(0.05 * TIDEWAY_LATTICE_SCALE, 6);
    expect(a[32 + 13]!).toBeCloseTo(0.22 * TIDEWAY_LATTICE_SCALE, 6);
    expect(a[32 + 14]!).toBeCloseTo(0, 6);
    // Instance 5 (module 1's outward deck rail) at yaw π/2 swings onto +Z.
    expect(a[5 * 16 + 12]!).toBeCloseTo(0, 6);
    expect(a[5 * 16 + 13]!).toBeCloseTo(0.22 * TIDEWAY_LATTICE_SCALE, 6);
    expect(a[5 * 16 + 14]!).toBeCloseTo(0.05 * TIDEWAY_LATTICE_SCALE, 6);

    overlay.dispose();
  });

  it("keeps the twin arches and lattice static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const arch = archMesh(scene);
    expect(arch).toBeDefined();
    expect(arch!.count).toBe(2);
    const archBefore = Array.from(arch!.instanceMatrix.array.slice(0, 32));
    const archVersionBefore = arch!.instanceMatrix.version;
    const bars = deckBarMesh(scene);
    expect(bars).toBeDefined();
    const barsBefore = Array.from(bars!.instanceMatrix.array.slice(0, 32));
    overlay.update(1000);
    const archAfter = Array.from(arch!.instanceMatrix.array.slice(0, 32));
    const barsAfter = Array.from(bars!.instanceMatrix.array.slice(0, 32));

    // The tideway cartridge idles without moving parts: update leaves every
    // matrix untouched and never re-uploads the instance buffers.
    expect(archAfter).toEqual(archBefore);
    expect(arch!.instanceMatrix.version).toBe(archVersionBefore);
    expect(barsAfter).toEqual(barsBefore);

    overlay.dispose();
  });

  it("assembles a readable twin-arch, lattice, conduit and rear-coupling silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The two large parallel arch emitters.
    const arch = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.098 && geo.parameters.tube === 0.016 && geo.parameters.arc === Math.PI);
    expect(arch).toHaveLength(1);
    expect(arch[0]!.count).toBe(2);

    // The brass collar brackets at the arch feet (the base stabilizer).
    const mounts = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.02 && geo.parameters.tube === 0.012);
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.count).toBe(2);

    // The bright cyan lattice deck: three bridge rails and a cross tie.
    const deckBars = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.012);
    expect(deckBars).toHaveLength(1);
    expect(deckBars[0]!.count).toBe(3);
    const deckRails = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.011);
    expect(deckRails).toHaveLength(1);
    expect(deckRails[0]!.count).toBe(1);

    // Two thick feed conduits from the pod body into the arch feet.
    const conduits = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.019);
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
    expect(TIDEWAY_LATTICE_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes the lattice rods, feed conduits and rear coupling to their intended length along the piece axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createTidewayLatticeModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.012, 0.15], // lattice deck rails (0.15 span across the wider gateway)
      [0.011, 0.104], // lattice cross tie
      [0.019, 0.0495], // feed conduit (3D from pod flank to arch foot)
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
          expect(axis.length()).toBeCloseTo(len * TIDEWAY_LATTICE_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});