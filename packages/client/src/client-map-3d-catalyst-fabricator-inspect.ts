// Inspection helpers for the Catalyst Fabricator (CAT) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the port arcs are
// partial rings turned onto the drum axis and swept by a rotor angle, the
// canisters stand tipped only by their yaw, and a loose bound would over-report
// every one of them and let the dock-envelope assertions pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
// CAD constants read by the probes.
import {
  CAT_CANISTER,
  CAT_COLLAR,
  CAT_DRUM,
  CAT_END_RING,
  CAT_OUTPUT,
  CAT_PARTITION,
  CAT_PORT,
  CAT_SEGMENT,
  CAT_VALVE,
  CAT_WINDOW
} from "./client-map-3d-catalyst-fabricator-parts.js";

export const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

type Geo = { type: string; parameters: Record<string, unknown> };
export const params = (mesh: InstancedMesh): Geo => mesh.geometry as unknown as Geo;

export const findByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find((mesh) => match(params(mesh)));

export const findAllByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(params(mesh)));

// Part radii are written as sums in the catalogue (a hoop is the shell's radius
// plus its own tube clearance), so they arrive as 0.05250000000000001 rather
// than 0.0525. Every geometry-parameter match here has to tolerate that.
const near = (actual: unknown, expected: number): boolean => typeof actual === "number" && Math.abs(actual - expected) < 1e-6;

const numberParam = (geo: Geo, key: string): number | undefined => geo.parameters[key] as number | undefined;

// The rotating multi-chamber drum: the barrel under the chambers, the three
// coloured chambers and the three swept port arcs (partial open cylinders).
export const barrelMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), CAT_DRUM.length) && near(numberParam(geo, "radiusTop"), CAT_DRUM.radius));
export const segmentMeshes = (scene: Scene): InstancedMesh[] =>
  findAllByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), CAT_SEGMENT.length) && near(numberParam(geo, "radiusTop"), CAT_SEGMENT.radius));
export const windowMeshes = (scene: Scene): InstancedMesh[] =>
  findAllByParams(scene, (geo) => geo.type === "CylinderGeometry" && geo.parameters.openEnded === true && near(numberParam(geo, "thetaLength"), CAT_WINDOW.thetaLength));
export const partitionMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), CAT_PARTITION.radius) && near(numberParam(geo, "tube"), CAT_PARTITION.tube));
export const endRingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), CAT_END_RING.radius) && near(numberParam(geo, "tube"), CAT_END_RING.tube));

// The three feed canisters and their seat collars.
export const canisterMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), CAT_CANISTER.radiusTop) && near(numberParam(geo, "height"), CAT_CANISTER.length));
export const canisterCollarMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), CAT_COLLAR.radius) && near(numberParam(geo, "tube"), CAT_COLLAR.tube));

// The single output chamber, its collar and violet product port.
export const outputMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), CAT_OUTPUT.length) && near(numberParam(geo, "radiusTop"), CAT_OUTPUT.radius));
export const outputPortMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), CAT_PORT.length) && near(numberParam(geo, "radiusTop"), CAT_PORT.radius));
export const valveKnobMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), CAT_VALVE.knobRadius) && near(numberParam(geo, "tube"), CAT_VALVE.knobTube));

// The low pod and the dockable seat.
export const podMesh = (scene: Scene): InstancedMesh | undefined => findByParams(scene, (geo) => geo.type === "CapsuleGeometry");
export const baseMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.032));

export const materialOf = (mesh: InstancedMesh): MeshStandardMaterial => mesh.material as MeshStandardMaterial;

export const translation = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 12]!, a[o + 13]!, a[o + 14]!);
};

// A rod's local +Y carries its length, so the second matrix column reads the
// piece's scaled axis.
export const yAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 4]!, a[o + 5]!, a[o + 6]!);
};

// Tori align their hole along the piece direction, so the third matrix column is
// the ring's scaled normal, and tori rotated onto the drum axis read it clearly.
export const zAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 8]!, a[o + 9]!, a[o + 10]!);
};

const matrixAt = (mesh: InstancedMesh, instance: number): Matrix4 => {
  const m = new Matrix4();
  mesh.getMatrixAt(instance, m);
  return m;
};

// An open port arc's swept centre: where the instance matrix aims the arc's
// geometry bisector. The arc geometry's thetaStart centres its bisector on
// geometry +X (see CAT_WINDOW), so the matrix's first column is the exact world
// direction of the arc's midpoint — no vertex scans, and it stays exact while
// the rotor sweeps and through any dock yaw.
export const arcHeading = (mesh: InstancedMesh, instance: number): Vector3 => {
  const m = matrixAt(mesh, instance);
  const heading = new Vector3();
  m.extractBasis(heading, new Vector3(), new Vector3());
  return heading.normalize();
};

// The arc's azimuth around the drum axis. The band is laid along the drum's +Z
// and the rotor turns it about that axis, so the sweep lives in the plane
// perpendicular to the drum — the XY plane — where the +X bisector moves to
// (cos φ, sin φ, 0): atan2(y, x) reads the rotor angle exactly.
export const arcAzimuth = (mesh: InstancedMesh, instance: number): number => {
  const heading = arcHeading(mesh, instance);
  return Math.atan2(heading.y, heading.x);
};

// Height and radius bounds for one mesh, measured through the real instance
// matrices over the transformed geometry vertices — exact for the tessellated
// mesh that renders, so a rotated piece is not over-reported.
export const bounds = (mesh: InstancedMesh): { minY: number; maxY: number; maxRadius: number } => {
  const m = new Matrix4();
  const v = new Vector3();
  const attr = mesh.geometry.getAttribute("position");
  let minY = Infinity;
  let maxY = -Infinity;
  let maxRadius = 0;
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, m);
    for (let k = 0; k < attr.count; k += 1) {
      v.fromBufferAttribute(attr, k).applyMatrix4(m);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
      maxRadius = Math.max(maxRadius, Math.hypot(v.x, v.z));
    }
  }
  return { minY, maxY, maxRadius };
};

export const envelope = (scene: Scene): { minY: number; maxY: number; maxRadius: number } => {
  let minY = Infinity;
  let maxY = -Infinity;
  let maxRadius = 0;
  for (const mesh of instancedMeshes(scene)) {
    if (mesh.count === 0) continue;
    const b = bounds(mesh);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
    maxRadius = Math.max(maxRadius, b.maxRadius);
  }
  return { minY, maxY, maxRadius };
};

// Whether a cylinder is laid along the WORLD Z axis (the drum's axis) rather
// than standing up: a quarter turn about X maps its local +Y onto +Z. A barrel
// that had stayed upright would fail this on both the Z and vertical columns.
export const cylinderLiesAlongZ = (mesh: InstancedMesh, instance = 0): boolean => {
  const axis = yAxisColumn(mesh, instance);
  const yy = Math.abs(axis.y);
  const zz = Math.abs(axis.z);
  return zz > 0.99 && yy < 1e-6 && Math.abs(axis.x) < 1e-6;
};

// Whether a ring's hole is aligned to the drum's Z axis, i.e. it clamps the
// barrel rather than slipping down onto its side.
export const ringWrapsZ = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return Math.abs(normal.z) > 0.99 && Math.abs(normal.x) < 1e-6 && Math.abs(normal.y) < 1e-6;
};