import { describe, expect, it } from "vitest";
import { CapsuleGeometry, CylinderGeometry, InstancedMesh, Matrix4, Scene, TorusGeometry, Vector3 } from "three";
import { AFC_BAY_INNER_RADIUS } from "./client-map-3d-fabrication-complex.js";
import { STRATODOCK_BASE_RADIUS, STRATODOCK_MODULE_HEIGHT, STRATODOCK_SCALE, createStratosphericDockyardModuleOverlay } from "./client-map-3d-stratospheric-dockyard-module.js";

const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

const meshByGeometry = (scene: Scene, match: (geo: { type: string; parameters: Record<string, unknown> }) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(mesh.geometry as unknown as { type: string; parameters: Record<string, unknown> }));

// The defining feature: the two heavy inward-curling cradle arms, pre-baked as
// partial tori.
const armArcMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "TorusGeometry" &&
      (mesh.geometry as TorusGeometry).parameters.arc !== undefined &&
      (mesh.geometry as TorusGeometry).parameters.arc! < Math.PI
  );

// The heavy arm posts standing on the plinth.
const postMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height === 1 &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.017
  );

const mastMesh = (scene: Scene): InstancedMesh | undefined =>
  instancedMeshes(scene).find(
    (mesh) =>
      mesh.geometry.type === "CylinderGeometry" &&
      (mesh.geometry as CylinderGeometry).parameters.height === 1 &&
      (mesh.geometry as CylinderGeometry).parameters.radiusTop === 0.014
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

const translation = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 12]!, a[o + 13]!, a[o + 14]!);
};

// A conservative world-space height envelope for every committed piece, sampled
// through the real instance matrices. Rotating a geometry's local bounding-box
// corners over-estimates, so treat the numbers as upper bounds.
const measureEnvelope = (scene: Scene): { minY: number; maxY: number; maxRadius: number } => {
  const m = new Matrix4();
  const v = new Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
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
        maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.z));
      }
    }
  }
  return { minY, maxY, maxRadius };
};

describe("stratospheric dockyard overlay", () => {
  it("commits a fully assembled module with a wide open cradle above a low pod", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(3, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const renderedPieces = instancedMeshes(scene).reduce((total, mesh) => total + mesh.count, 0);
    expect(renderedPieces).toBeGreaterThan(0);

    // The dominant mechanism: two heavy curved cradle arms and two arm posts
    // per instance.
    const arms = armArcMesh(scene);
    expect(arms).toBeDefined();
    expect(arms!.count).toBe(4);
    const posts = postMesh(scene);
    expect(posts).toBeDefined();
    expect(posts!.count).toBe(4);

    // One short rear lifting mast with a capstan winch.
    const masts = mastMesh(scene);
    expect(masts).toBeDefined();
    expect(masts!.count).toBe(2);

    // The low, wide dock pod is the base form.
    const pods = meshByGeometry(scene, (geo) => geo.type === "CapsuleGeometry");
    expect(pods).toHaveLength(1);
    expect(pods[0]!.count).toBe(2);

    // The circular seat is the dockable unit; its footprint must clear the
    // AFC bay inner radius so it physically slots into the socket ring.
    expect(STRATODOCK_BASE_RADIUS).toBeLessThan(AFC_BAY_INNER_RADIUS);

    overlay.dispose();
  });

  it("clears instance counts without removing meshes from the scene", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 1);

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
    const overlay = createStratosphericDockyardModuleOverlay(scene, 14_000);

    const totalBytes = instancedMeshes(scene).reduce((total, mesh) => total + mesh.instanceMatrix.array.length * 4, 0);
    expect(totalBytes).toBeLessThan(64 * 1024 * 1024);

    overlay.dispose();
  });

  it("seats the module at the socket dock height on the given surface", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 2);

    overlay.addInstance(0, 0, 2, 0, 0, 0);
    overlay.commit();

    const seat = seatBaseMesh(scene);
    expect(seat).toBeDefined();
    // Centered on the bay, base lifted 0.016 (× STRATODOCK_SCALE) above the pad top.
    expect(seat!.instanceMatrix.array[12]!).toBeCloseTo(0, 6);
    expect(seat!.instanceMatrix.array[13]!).toBeCloseTo(2 + 0.016 * STRATODOCK_SCALE, 6);
    expect(seat!.instanceMatrix.array[14]!).toBeCloseTo(0, 6);

    overlay.dispose();
  });

  it("carries the cradle around the socket azimuth yaw", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 4);

    const azimuth = Math.PI / 2;
    overlay.addInstance(0, 0, 2, azimuth, 0, 0);
    overlay.commit();

    // A yaw of π/2 swaps the module's local ±Z (where the two cradle arms sit)
    // onto the world ±X, so both arms stay mirrored about the socket center
    // while the assembly swings around the bay azimuth.
    const posts = postMesh(scene);
    expect(posts).toBeDefined();
    expect(posts!.count).toBe(2);
    const a = posts!.instanceMatrix.array;
    const armZ = 0.075 * STRATODOCK_SCALE;
    expect(a[14]! * a[14]! + a[12]! * a[12]! > 0).toBe(true);
    for (let i = 0; i < 2; i += 1) {
      const p = translation(posts!, i);
      // Height is yaw-invariant, and the arm feet keep their ±spread.
      expect(p.y).toBeCloseTo(2 + 0.17 * STRATODOCK_SCALE, 6);
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(armZ, 6);
    }

    overlay.dispose();
  });

  it("rotates different docked modules to different yaws", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.addInstance(0, 0, 0, Math.PI / 2, 1, 0);
    overlay.commit();

    const arms = armArcMesh(scene);
    expect(arms).toBeDefined();
    expect(arms!.count).toBe(4);
    // At yaw 0 the arm arcs sit off to ±Z; at yaw π/2 the same arcs have swung
    // onto ±X, so the pair's spread axis rotates with the socket azimuth.
    const first = [translation(arms!, 0), translation(arms!, 1)];
    const second = [translation(arms!, 2), translation(arms!, 3)];
    expect(Math.abs(first[0]!.z)).toBeCloseTo(Math.abs(first[1]!.z), 6);
    expect(first[0]!.z).toBeCloseTo(-first[1]!.z, 6);
    expect(Math.abs(second[0]!.x)).toBeCloseTo(Math.abs(second[1]!.x), 6);
    expect(second[0]!.x).toBeCloseTo(-second[1]!.x, 6);
    expect(Math.abs(first[0]!.z)).toBeGreaterThan(0.01);
    expect(Math.abs(second[0]!.x)).toBeGreaterThan(0.01);

    overlay.dispose();
  });

  it("keeps the cradle, winch and cables static on update (no idle animation)", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 4);

    overlay.addInstance(0, 0, 0, 0, 3, 7);
    overlay.commit();

    const arms = armArcMesh(scene);
    expect(arms).toBeDefined();
    expect(arms!.count).toBe(2);
    const armsBefore = Array.from(arms!.instanceMatrix.array.slice(0, 32));
    const armsVersionBefore = arms!.instanceMatrix.version;
    // The winch drum is a straight cylinder (top and bottom radii equal); the
    // rear coupling is tapered, so radiusBottom tells them apart.
    const winch = meshByGeometry(
      scene,
      (geo) =>
        geo.type === "CylinderGeometry" &&
        (geo as CylinderGeometry).parameters.height === 1 &&
        geo.parameters.radiusTop === 0.024 &&
        geo.parameters.radiusBottom === 0.024
    );
    expect(winch).toHaveLength(1);
    const winchBefore = Array.from(winch[0]!.instanceMatrix.array.slice(0, 16));
    overlay.update(1000);

    // The rig idles without moving parts: update leaves every matrix untouched
    // and never re-uploads the instance buffers. The winch does not turn and
    // the hoist cables do not sway.
    expect(Array.from(arms!.instanceMatrix.array.slice(0, 32))).toEqual(armsBefore);
    expect(arms!.instanceMatrix.version).toBe(armsVersionBefore);
    expect(Array.from(winch[0]!.instanceMatrix.array.slice(0, 16))).toEqual(winchBefore);

    overlay.dispose();
  });

  it("assembles a readable cradle, mast, winch and cable silhouette with a bounded height", () => {
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // Two heavy curved cradle arms, two posts, two brass clamp collars.
    const arms = meshByGeometry(
      scene,
      (geo) => geo.type === "TorusGeometry" && (geo as TorusGeometry).parameters.arc !== undefined && (geo as TorusGeometry).parameters.arc! < Math.PI
    );
    expect(arms).toHaveLength(1);
    expect(arms[0]!.count).toBe(2);
    const posts = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.017);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.count).toBe(2);
    const clamps = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.021 && geo.parameters.tube === 0.008);
    expect(clamps).toHaveLength(1);
    expect(clamps[0]!.count).toBe(2);

    // The short rear lifting mast and its chunky capstan winch with two brass
    // end flanges.
    const masts = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.014);
    expect(masts).toHaveLength(1);
    expect(masts[0]!.count).toBe(1);
    const winch = meshByGeometry(
      scene,
      (geo) =>
        geo.type === "CylinderGeometry" &&
        (geo as CylinderGeometry).parameters.height === 1 &&
        geo.parameters.radiusTop === 0.024 &&
        geo.parameters.radiusBottom === 0.024
    );
    expect(winch).toHaveLength(1);
    expect(winch[0]!.count).toBe(1);
    const flanges = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 0.01);
    expect(flanges).toHaveLength(1);
    expect(flanges[0]!.count).toBe(2);

    // Two thick hoist cables with a brass lifting eye at each cradle arm tip.
    const cables = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.005);
    expect(cables).toHaveLength(1);
    expect(cables[0]!.count).toBe(2);
    const eyes = meshByGeometry(scene, (geo) => geo.type === "TorusGeometry" && geo.parameters.radius === 0.011 && geo.parameters.tube === 0.005);
    expect(eyes).toHaveLength(1);
    expect(eyes[0]!.count).toBe(2);

    // The heavy rear AFC coupling: one thick steel stub per instance.
    const coupling = meshByGeometry(
      scene,
      (geo) =>
        geo.type === "CylinderGeometry" &&
        (geo as CylinderGeometry).parameters.height === 1 &&
        geo.parameters.radiusTop === 0.024 &&
        geo.parameters.radiusBottom === 0.026
    );
    expect(coupling).toHaveLength(1);
    expect(coupling[0]!.count).toBe(1);

    // A module cartridge that never overgrows its dock: ~0.34 tall scaled.
    expect(STRATODOCK_MODULE_HEIGHT).toBeLessThanOrEqual(0.34);

    overlay.dispose();
  });

  it("leaves the cradle's central bay genuinely open for a held aerial component", () => {
    // Regression: the cradle is the dominant readable mechanism, so nothing may
    // fill the space it is supposed to cradle. The two arm posts must stand
    // well apart, the arm tips must curl only slightly inward (a quarter arc
    // would sweep inward as far as it rises and shut the bay), the plinth must
    // sit below the arm tips, and the hoist cables must run over the top of the
    // bay rather than across its middle.
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    const postRadius = 0.017;
    const posts = postMesh(scene)!;
    const feet = [translation(posts, 0), translation(posts, 1)];
    // Wide U: the clear span between the two posts' inner faces.
    const clearSpan = Math.abs(feet[0]!.z - feet[1]!.z) - 2 * postRadius * STRATODOCK_SCALE;
    expect(clearSpan).toBeGreaterThan(0.13);

    // The cradle deck sits below the arm tips, so the bay has real depth.
    const plinth = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 0.022)[0]!;
    const plinthTop = translation(plinth, 0).y + (0.011 * STRATODOCK_SCALE);
    const { maxY } = measureEnvelope(scene);
    expect(plinthTop).toBeLessThan(maxY - 0.08);

    // Hoist cables run level with the arm tips, across the top of the bay.
    const cables = meshByGeometry(scene, (geo) => geo.type === "CylinderGeometry" && (geo as CylinderGeometry).parameters.height === 1 && geo.parameters.radiusTop === 0.005)[0]!;
    for (let i = 0; i < cables.count; i += 1) {
      const cableY = translation(cables, i).y;
      expect(cableY).toBeGreaterThan(plinthTop + 0.06);
      expect(cableY).toBeLessThan(maxY);
    }

    // Nothing pokes below the socket pad: the rig stands on its seat.
    expect(measureEnvelope(scene).minY).toBeGreaterThanOrEqual(-0.01);

    overlay.dispose();
  });

  it("sizes the mast, posts, winch and cables to their intended length along the piece axis", () => {
    // Pieces placed via addPieceAlong must render as short rods along their
    // direction (regression for the black-slab length-slot bug).
    const scene = new Scene();
    const overlay = createStratosphericDockyardModuleOverlay(scene, 1);

    overlay.addInstance(0, 0, 0, 0, 0, 0);
    overlay.commit();

    // Both radii are listed because the capstan drum and the rear coupling stub
    // share a top radius and differ only in taper.
    const expectedLengths: Array<[number, number, number]> = [
      [0.017, 0.017, 0.04], // cradle arm posts (plinth rim up to the arc)
      [0.014, 0.014, 0.12], // short rear lifting mast
      [0.024, 0.024, 0.044], // capstan winch drum
      [0.005, 0.005, 0.0801], // hoist cables (0.058² + 0.0058² + 0.055²)½
      [0.024, 0.026, 0.05] // heavy rear coupling stub
    ];

    for (const [radiusTop, radiusBottom, len] of expectedLengths) {
      const meshes = meshByGeometry(
        scene,
        (geo) =>
          geo.type === "CylinderGeometry" &&
          (geo as CylinderGeometry).parameters.height === 1 &&
          geo.parameters.radiusTop === radiusTop &&
          geo.parameters.radiusBottom === radiusBottom
      );
      expect(meshes.length).toBeGreaterThan(0);
      for (const mesh of meshes) {
        expect(mesh.count).toBeGreaterThan(0);
        for (let i = 0; i < mesh.count; i += 1) {
          const axis = yAxisColumn(mesh, i);
          expect(axis.length()).toBeCloseTo(len * STRATODOCK_SCALE, 2);
        }
      }
    }

    overlay.dispose();
  });
});
