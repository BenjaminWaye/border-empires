// Inspection helpers for the Ancillary Control Core (ACC) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the control core is a
// vertical tower capped by a cage of thin rods, the arms and conduits rise and
// fall, and a loose bound would over-report everything and let the dock-envelope
// assertions pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
// CAD constants read by the probes.
import {
  ACC_ARM,
  ACC_CAGE,
  ACC_CLAMP,
  ACC_CORE,
  ACC_FIN,
  ACC_GLOW
} from "./client-map-3d-ancillary-control-core-parts.js";

export const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

type Geo = { type: string; parameters: Record<string, unknown> };
export const params = (mesh: InstancedMesh): Geo => mesh.geometry as unknown as Geo;

export const findByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find((mesh) => match(params(mesh)));

export const findAllByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh[] =>
  instancedMeshes(scene).filter((mesh) => match(params(mesh)));

// Part radii are written as sums in the catalogue (a hoop is the housing's
// radius plus its own tube clearance), so a few arrive as long decimal tails
// rather than clean numbers. Every geometry-parameter match here tolerates that.
const near = (actual: unknown, expected: number): boolean => typeof actual === "number" && Math.abs(actual - expected) < 1e-6;

const numberParam = (geo: Geo, key: string): number | undefined => geo.parameters[key] as number | undefined;

// The squat vertical processor housing and its cooling fins.
export const coreMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), ACC_CORE.length) && near(numberParam(geo, "radiusTop"), ACC_CORE.radius));
export const finMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), ACC_FIN.length) && near(numberParam(geo, "radiusTop"), ACC_FIN.radius));
// The heavy brass clamp bands reinforcing the housing.
export const clampMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), ACC_CLAMP.radius) && near(numberParam(geo, "tube"), ACC_CLAMP.tube));

// The restrained cyan glow core and its brass cage.
export const glowMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), ACC_GLOW.length) && near(numberParam(geo, "radiusTop"), ACC_GLOW.radius));
export const cageRodMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), ACC_CAGE.rodRadius) && near(numberParam(geo, "height"), 1));
export const cageHoopMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), ACC_CAGE.radius) && near(numberParam(geo, "tube"), ACC_CAGE.hoopTube));

// The four articulated control arms: shoulder and elbow joints, the two conduit
// runs, and the squat relay blocks with their brass collars.
export const shoulderMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && near(numberParam(geo, "radius"), ACC_ARM.shoulderRadius));
export const elbowMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && near(numberParam(geo, "radius"), ACC_ARM.elbowRadius));
export const upperArmMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), ACC_ARM.upperR) && near(numberParam(geo, "height"), 1));
export const lowerArmMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), ACC_ARM.lowerR) && near(numberParam(geo, "height"), 1));
export const relayMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), ACC_ARM.relayLength) && near(numberParam(geo, "radiusTop"), ACC_ARM.relayRadius));
export const relayCollarMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), ACC_ARM.collarRadius) && near(numberParam(geo, "tube"), ACC_ARM.collarTube));

// The two thick power conduits around the rear.
export const conduitMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), 0.008) && near(numberParam(geo, "height"), 1));

// The low pod and the dockable seat.
export const podMesh = (scene: Scene): InstancedMesh | undefined => findByParams(scene, (geo) => geo.type === "CapsuleGeometry");
export const baseMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.032));

// The heavy rear AFC connector and its cyan contact tip.
export const couplingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), 0.024) && near(numberParam(geo, "height"), 1));
export const couplingRingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), 0.03) && near(numberParam(geo, "tube"), 0.011));
export const couplingTipMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.016) && near(numberParam(geo, "radiusTop"), 0.014));

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
// the ring's scaled normal.
export const zAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 8]!, a[o + 9]!, a[o + 10]!);
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

// Whether a cylinder stands vertically on the WORLD Y axis rather than lying
// down: an upright cylinder's axis column keeps only its Y component. A piece
// that had tipped over would show X or Z components instead.
export const cylinderStandsVertical = (mesh: InstancedMesh, instance = 0): boolean => {
  const axis = yAxisColumn(mesh, instance);
  return axis.y > 1e-3 && Math.abs(axis.x) < 1e-6 && Math.abs(axis.z) < 1e-6;
};

// Whether a ring's hole is aligned to the world Y axis, i.e. it wraps a
// vertical cylinder (a clamp band, a cage hoop or a relay collar) rather than
// lying flat on the ground.
export const ringWrapsY = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return normal.y > 0.5 && Math.abs(normal.x) < 1e-6 && Math.abs(normal.z) < 1e-6;
};