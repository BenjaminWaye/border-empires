// Inspection helpers for the Neural Assembly Core (NAC) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the neural core is a
// low dark sphere ringed by thin glowing pathways and wrapped in a brass gimbal,
// and a loose bound would over-report everything and let the dock-envelope
// assertions pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
// CAD constants read by the probes.
import { NAC_ARM, NAC_CONDUIT, NAC_GIMBAL, NAC_GLASS, NAC_HOUSING, NAC_PATHWAY, NAC_POST } from "./client-map-3d-neural-assembly-core-parts.js";

export const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

type Geo = { type: string; parameters: Record<string, unknown> };
export const params = (mesh: InstancedMesh): Geo => mesh.geometry as unknown as Geo;

export const findByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find((mesh) => match(params(mesh)));

// Part radii are written as sums in the catalogue, so a few arrive as long
// decimal tails rather than clean numbers. Every geometry-parameter match here
// tolerates that.
const near = (actual: unknown, expected: number): boolean => typeof actual === "number" && Math.abs(actual - expected) < 1e-6;

const numberParam = (geo: Geo, key: string): number | undefined => geo.parameters[key] as number | undefined;

// The dark smoky-glass neural sphere suspended above the pod.
export const sphereMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && near(numberParam(geo, "radius"), NAC_GLASS.radius));
// The broad glowing cyan pathway rings crossed over the sphere's surface.
export const pathwayMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), NAC_PATHWAY.radius) && near(numberParam(geo, "tube"), NAC_PATHWAY.tube));
// The two crossed brass gimbal hoops cradling the core.
export const gimbalOuterMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), NAC_GIMBAL.outerRadius) && near(numberParam(geo, "tube"), NAC_GIMBAL.tube));
export const gimbalInnerMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), NAC_GIMBAL.innerRadius) && near(numberParam(geo, "tube"), NAC_GIMBAL.tube));

// The compact processor housing, its brass clamp band and the thin post.
export const housingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), NAC_HOUSING.radius) && near(numberParam(geo, "height"), 1));
export const housingBandMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), NAC_HOUSING.radius + 0.004) && near(numberParam(geo, "tube"), 0.0065));
export const postMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), NAC_POST.radius) && near(numberParam(geo, "height"), 1));

// The four conductor arms: shoulder joints, upper runs, gimbal-seated elbows
// and inward-reaching contact prongs.
export const shoulderMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && near(numberParam(geo, "radius"), NAC_ARM.shoulderRadius));
export const elbowMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && near(numberParam(geo, "radius"), NAC_ARM.elbowRadius));
export const upperArmMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), NAC_ARM.upperR) && near(numberParam(geo, "height"), 1));
export const prongMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), NAC_ARM.prongR) && near(numberParam(geo, "height"), 1));

// The two heavy data/power runs low on the rear.
export const conduitMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), NAC_CONDUIT.radius) && near(numberParam(geo, "height"), 1));

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

// Whether a ring's hole aligns to the world Z axis — the meridian pathway ring
// and the outer gimbal hoop are vertical hoops in the forward (XY) plane, seen
// face-on through the module's local +Z. Only exact at yaw = 0.
export const ringWrapsZ = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return Math.abs(normal.z) > 0.5 && Math.abs(normal.x) < 1e-6 && Math.abs(normal.y) < 1e-6;
};

// Whether a ring's hole aligns to the world X axis — the inner gimbal hoop is a
// vertical hoop in the cross (ZY) plane. Only exact at yaw = 0.
export const ringWrapsX = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return Math.abs(normal.x) > 0.5 && Math.abs(normal.y) < 1e-6 && Math.abs(normal.z) < 1e-6;
};

// Whether a ring's hole aligns to the world Y axis — a horizontal band like the
// equator pathway ring lying flat on its circle. Only exact at yaw = 0.
export const ringLiesHorizontal = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return Math.abs(normal.y) > 0.5 && Math.abs(normal.x) < 1e-6 && Math.abs(normal.z) < 1e-6;
};