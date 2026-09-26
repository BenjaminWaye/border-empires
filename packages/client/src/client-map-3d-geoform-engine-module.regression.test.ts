import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Matrix4, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS, AFC_SOCKET_RING_RADIUS } from "./client-map-3d-fabrication-complex.js";
import { GEOFORM_BASE_RADIUS, GEOFORM_MODULE_HEIGHT, GEOFORM_SCALE, createGeoformEngineModuleOverlay } from "./client-map-3d-geoform-engine-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The defining feature: the oversized dark-steel compaction press head — a fat
// drum of radius 0.062 on the angled piston axis.
const headMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height === 1 &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.062
  );

// The four thick hydraulic struts caging the piston between mount and head.
const strutMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height === 1 &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.016
  );

const seatBaseMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height !== 1 &&
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

// A conservative world-space height/forward-reach envelope for every committed
// piece, sampled through the real instance matrices. Rotating a geometry's local
// bounding-box corners over-estimates slightly, so treat the numbers as upper
// bounds — that is safe for both "must not dip below the pad" and "must not
// crowd the neighbouring socket" style assertions.
const measureEnvelope = (scene: Scene): { minY: number; maxY: number; maxX: number; maxRadius: number } => {
  const m = new Matrix4();
  const v = new Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  let maxX = -Infinity;
  let maxRadius = 0;
  for (const mesh of instancedMeshes(scene)) {
    if (mesh.count === 0) continue;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, m);
      for (let c = 0; c < 8; c += 1) {
        v
          .set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z)
          .applyMatrix4(m);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
        maxX = Math.max(maxX, v.x);
        maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.z));
      }
    }
  }
  return { minY, maxY, maxX, maxRadius };
};

describe("geoform engine overlay", () => {
  it("commits a fully assembled module with a huge press head under a strut cage", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The defining feature: one massive press head and a four-strut hydraulic
    // cage per instance.
    const heads = headMesh(scene);
    expect(heads).toBeDefined();
    expect(heads!.count).toBe(2);
    const struts = strutMesh(scene);
    expect(struts).toBeDefined();
    expect(struts!.count).toBe(8);

    // The rounded pod body is the dominant base form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(GEOFORM_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 1);

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
    const overlay = createGeoformEngineModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce(
      (total, mesh) => total + mesh.instanceMatrix.array.length * 4,
      0
    );
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× GEOFORM_SCALE) above the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * GEOFORM_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the press head around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    const heads = headMesh(scene);
    expect(heads).toBeDefined();
    expect(heads!.count).toBe(1);
    // The head center sits down-forward of the pod's mount at
    // (0.145 + 0.62·0.132, 0.17 − 0.785·0.132) ≈ (0.227, 0.066). Yaw π/2
    // swings its +X offset to +Z; heights also grow with the scale.
    const x = 0.145 + 0.62 * 0.132;
    const y = 0.17 - 0.785 * 0.132;
    expect(heads!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(heads!.instanceMatrix.array[13]!).toBeCloseTo(2 + y * GEOFORM_SCALE, 6);
    expect(heads!.instanceMatrix.array[14]!).toBeCloseTo(x * GEOFORM_SCALE, 6);

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const heads = headMesh(scene);
    expect(heads).toBeDefined();
    expect(heads!.count).toBe(2);
    const a = heads!.instanceMatrix.array;
    const x = 0.145 + 0.62 * 0.132;
    const y = 0.17 - 0.785 * 0.132;
    // Instance 0 at yaw 0: the head's forward +X offset stays on +X.
    expect(a[12]!).toBeCloseTo(x * GEOFORM_SCALE, 6);
    expect(a[13]!).toBeCloseTo(y * GEOFORM_SCALE, 6);
    expect(a[14]!).toBeCloseTo(0, 6);
    // Instance 1 at yaw π/2: the same +X offset swings onto +Z.
    expect(a[16 + 12]!).toBeCloseTo(0, 6);
    expect(a[16 + 13]!).toBeCloseTo(y * GEOFORM_SCALE, 6);
    expect(a[16 + 14]!).toBeCloseTo(x * GEOFORM_SCALE, 6);

    overlay.dispose();
  });

  it("keeps the press and strut cage static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const head = headMesh(scene);
    expect(head).toBeDefined();
    expect(head!.count).toBe(1);
    const headBefore = Array.from(head!.instanceMatrix.array.slice(0, 16));
    const headVersionBefore = head!.instanceMatrix.version;
    const struts = strutMesh(scene);
    expect(struts).toBeDefined();
    const strutsBefore = Array.from(struts!.instanceMatrix.array.slice(0, 64));
    overlay.update(1000);
    const headAfter = Array.from(head!.instanceMatrix.array.slice(0, 16));
    const strutsAfter = Array.from(struts!.instanceMatrix.array.slice(0, 64));

    // The geoform cartridge idles without moving parts: update leaves every
    // matrix untouched and never re-uploads the instance buffers. No piston
    // stroke animation — the press is a static heavy asset.
    expect(headAfter).toEqual(headBefore);
    expect(head!.instanceMatrix.version).toBe(headVersionBefore);
    expect(strutsAfter).toEqual(strutsBefore);

    overlay.dispose();
  });

  it("assembles a readable press-head, accumulator and coupling silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // The massive press head drum.
    const head = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.062);
    expect(head).toHaveLength(1);
    expect(head[0]!.count).toBe(1);

    // The brass press-mount collar and head shoulder band.
    const collar = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.062 && geo.parameters.tube === 0.015);
    expect(collar).toHaveLength(1);
    expect(collar[0]!.count).toBe(1);
    const headBand = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.066 && geo.parameters.tube === 0.013);
    expect(headBand).toHaveLength(1);
    expect(headBand[0]!.count).toBe(1);

    // Four breaker teeth biting into the ground around the press face.
    const teeth = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.012);
    expect(teeth).toHaveLength(1);
    expect(teeth[0]!.count).toBe(4);

    // Four thick hydraulic struts.
    const struts = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.016);
    expect(struts).toHaveLength(1);
    expect(struts[0]!.count).toBe(4);

    // Two heavy accumulator cylinders with brass caps.
    const accumulators = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.021);
    expect(accumulators).toHaveLength(1);
    expect(accumulators[0]!.count).toBe(2);
    const accCaps = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.021 && geo.parameters.tube === 0.008);
    expect(accCaps).toHaveLength(1);
    expect(accCaps[0]!.count).toBe(2);

    // Two short armored conduits from the flank into the press mount.
    const conduits = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.013);
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
    expect(GEOFORM_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("reaches down to the crust without clipping through the socket pad", () => {
    // Regression: the compaction head is cantilevered off the pod's front, so
    // the press assembly reaches far forward and down. Docked at socket height,
    // the breaker teeth must stop at the pad line — an earlier build sank the
    // whole head 6cm below the pad, which punched through the AFC socket deck
    // whenever a Geoform Engine was docked.
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const { minY } = measureEnvelope(scene);
    expect(minY).toBeGreaterThanOrEqual(-0.01);

    overlay.dispose();
  });

  it("does not crowd the neighbouring socket's module when the press is extended", () => {
    // The press head is the longest forward reach of any module family, so the
    // two modules on adjacent sockets must still clear each other: the AFC ring
    // places socket centers 2·R·sin(π/8) ≈ 0.98 world units apart.
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const { maxX } = measureEnvelope(scene);
    const socketSpacing = 2 * AFC_SOCKET_RING_RADIUS * Math.sin(Math.PI / 8);
    // Two opposing reaches must not meet: 2·reach < socket spacing.
    expect(2 * maxX).toBeLessThan(socketSpacing);
    // And the press must actually be a forward-reaching mechanism, not a stub.
    expect(maxX).toBeGreaterThan(0.3);

    overlay.dispose();
  });

  it("sizes the piston, struts, teeth, conduits and rear coupling to their intended length along the piece axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createGeoformEngineModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const expectedLengths: Array<[number, number]> = [
      [0.038, 0.05], // piston sleeve
      [0.027, 0.055], // slim piston rod
      [0.062, 0.04], // press head drum
      [0.05, 0.016], // press face
      [0.012, 0.026], // breaker teeth
      [0.016, 0.115], // hydraulic struts
      [0.021, 0.05], // accumulator cylinders
      [0.013, 0.0588], // armored feeds (0.0413² + 0.0416² + 0.005²)½
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
          expect(axis.length()).toBeCloseTo(len * GEOFORM_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});
