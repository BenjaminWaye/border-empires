import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, IcosahedronGeometry, InstancedMesh, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import {
  AETHERWARD_COIL_BASE_RADIUS,
  AETHERWARD_COIL_MODULE_HEIGHT,
  AETHERWARD_COIL_SCALE,
  createAetherwardCoilModuleOverlay
} from "./client-map-3d-aetherward-coil-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The defining feature: the oversized aged-brass horseshoe coil laid around
// the pod crown, radius 0.095, tube 0.022, swept 275° (its open mouth faces +X).
const coilMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "TorusGeometry" &&
      (mesh.geometry as TorusGeometry).parameters.radius === 0.095 &&
      (mesh.geometry as TorusGeometry).parameters.tube === 0.022
  );

// The small suspended cyan aether node cradled in the coil's open mouth.
const nodeMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "IcosahedronGeometry" &&
      (mesh.geometry as IcosahedronGeometry).parameters.radius === 0.022
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

describe("aetherward coil overlay", () => {
  it("commits a fully assembled module with a horseshoe coil and suspended node", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The defining feature: one large horseshoe coil per instance, with the
    // suspended cyan node cradled in its open mouth.
    const coils = coilMesh(scene);
    expect(coils).toBeDefined();
    expect(coils!.count).toBe(2);
    const nodes = nodeMesh(scene);
    expect(nodes).toBeDefined();
    expect(nodes!.count).toBe(2);

    // The rounded pod body is the dominant base form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(AETHERWARD_COIL_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 1);

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
    const overlay = createAetherwardCoilModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× AETHERWARD_COIL_SCALE) above
    // the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * AETHERWARD_COIL_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the suspended node around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const nodes = nodeMesh(scene);
    expect(nodes).toBeDefined();
    // The node sits in the coil's open mouth at module-local (0.11, 0.178, 0);
    // yaw π/2 swings that +X offset to +Z. Heights also grow with the scale.
    expect(nodes!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(nodes!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.178 * AETHERWARD_COIL_SCALE, 6);
    expect(nodes!.instanceMatrix.array[14]!).toBeCloseTo(0.11 * AETHERWARD_COIL_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const nodes = nodeMesh(scene);
    expect(nodes).toBeDefined();
    expect(nodes!.count).toBe(2);
    const a = nodes!.instanceMatrix.array;
    // Instance 0 yaw 0: the node's +X mouth offset stays on +X.
    expect(a[12]!).toBeCloseTo(0.11 * AETHERWARD_COIL_SCALE, 6);
    expect(a[13]!).toBeCloseTo(0.178 * AETHERWARD_COIL_SCALE, 6);
    expect(a[14]!).toBeCloseTo(0, 6);
    // Instance 1 yaw π/2 (the node slot is per-instance, so module 1's node
    // lives at instance index 1): the same +X offset swings onto +Z.
    expect(a[28]!).toBeCloseTo(0, 6);
    expect(a[29]!).toBeCloseTo(0.178 * AETHERWARD_COIL_SCALE, 6);
    expect(a[30]!).toBeCloseTo(0.11 * AETHERWARD_COIL_SCALE, 6);

    overlay.dispose();
  });

  it("keeps the horseshoe coil static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const node = nodeMesh(scene);
    expect(node).toBeDefined();
    expect(node!.count).toBe(1);

    const nodeBefore = Array.from(node!.instanceMatrix.array.slice(0, 16));
    const nodeVersionBefore = node!.instanceMatrix.version;
    const coil = coilMesh(scene);
    expect(coil).toBeDefined();
    const coilBefore = Array.from(coil!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);
    const nodeAfter = Array.from(node!.instanceMatrix.array.slice(0, 16));
    const coilAfter = Array.from(coil!.instanceMatrix.array.slice(0, 16));

    // The aetherward cartridge idles without moving parts: update leaves every
    // matrix untouched and never re-uploads the instance buffers.
    expect(nodeAfter).toEqual(nodeBefore);
    expect(node!.instanceMatrix.version).toBe(nodeVersionBefore);
    expect(coilAfter).toEqual(coilBefore);

    overlay.dispose();
  });

  it("assembles a readable coil, brass base, dual conduits and rear coupling silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The oversized horseshoe coil, swept 275° so its open mouth faces forward.
    const coil = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.095 && geo.parameters.tube === 0.022);
    expect(coil).toHaveLength(1);
    expect(coil[0]!.count).toBe(1);

    // The thick brass collarring where the coil is anchored on the pod.
    const collar = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.085 && geo.parameters.tube === 0.03);
    expect(collar).toHaveLength(1);
    expect(collar[0]!.count).toBe(1);

    // Two brass hubs under the coil's front prongs.
    const hubs = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.024 && geo.parameters.tube === 0.012);
    expect(hubs).toHaveLength(1);
    expect(hubs[0]!.count).toBe(2);

    // The small suspended cyan node and its brighter core in the open mouth.
    const node = meshByGeometry(scene, (geo) => geo.type === "IcosahedronGeometry" && (geo as IcosahedronGeometry).parameters.radius === 0.022);
    expect(node).toHaveLength(1);
    expect(node[0]!.count).toBe(1);
    const nodeCore = meshByGeometry(scene, (geo) => geo.type === "IcosahedronGeometry" && (geo as IcosahedronGeometry).parameters.radius === 0.013);
    expect(nodeCore).toHaveLength(1);
    expect(nodeCore[0]!.count).toBe(1);

    // Two thick insulated conduits running from the coil into the body.
    const conduits = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.017);
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
    expect(AETHERWARD_COIL_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("sizes the feed conduits and rear coupling to their intended length along the cylinder axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createAetherwardCoilModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.017, 0.097], // feed conduit (0.065² + 0.072²)½
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
          expect(axis.length()).toBeCloseTo(len * AETHERWARD_COIL_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});