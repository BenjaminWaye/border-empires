// Inspection helpers for the Reserve Lattice (RL) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the reserve drum is a
// horizontal barrel of thin ribs and rails with a lain-flat glow inside, and a
// loose bound would over-report everything and let the dock-envelope assertions
// pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
// CAD constants read by the probes.
import { RL_BAR, RL_CLAMP, RL_CONDUIT, RL_DRUM, RL_DRUM_CORE, RL_GLOW, RL_NODE, RL_RIB } from "./client-map-3d-reserve-lattice-parts.js";

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

// The dark inner steel cylinder of the reserve drum and its thick brass ribs.
export const drumCoreMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), RL_DRUM_CORE.radius) && near(numberParam(geo, "height"), 1));
export const ribMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), RL_RIB.radius) && near(numberParam(geo, "tube"), RL_RIB.tube));
// The thin steel lattice bars running the length of the drum.
export const barMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), RL_BAR.radius) && near(numberParam(geo, "height"), 1));
// The compact locking clamps at either end of the drum.
export const clampMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), RL_CLAMP.radius) && near(numberParam(geo, "tube"), RL_CLAMP.tube));

// The faint contained glow inside the lattice and the cyan indicator nodes on
// the drum's top ridge.
export const glowMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), RL_GLOW.radius) && near(numberParam(geo, "height"), 1));
export const nodeMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && near(numberParam(geo, "radius"), RL_NODE.radius));

// The two heavy retaining conduits tying the drum into the rear of the pod.
export const conduitMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), RL_CONDUIT.radius) && near(numberParam(geo, "height"), 1));

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

// Whether a cylinder lies along the world Z axis (a rod running the length of
// the reserve drum, laid across the pod) rather than standing upright: a
// lain-flat drum cylinder keeps its axis column on the Z component. Only exact
// at yaw = 0, when the module faces straight down the world +Z axis.
export const cylinderAlongZ = (mesh: InstancedMesh, instance = 0): boolean => {
  const axis = yAxisColumn(mesh, instance);
  return Math.abs(axis.z) > 1e-3 && Math.abs(axis.x) < 1e-6 && axis.y < 1e-6;
};

// Whether a cylinder lies flat in the world XZ plane — the drum stays
// horizontal under any dock yaw, even though its axis rotates about Y.
export const cylinderHorizontal = (mesh: InstancedMesh, instance = 0): boolean => {
  const axis = yAxisColumn(mesh, instance);
  return Math.abs(axis.y) < 1e-6 && Math.hypot(axis.x, axis.z) > 1e-3;
};

// Whether a ring's hole is aligned to the world Z axis, i.e. it wraps a drum
// laid across the pod (a rib or an end clamp) rather than lying flat on the
// ground.
export const ringWrapsZ = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return Math.abs(normal.z) > 0.5 && Math.abs(normal.x) < 1e-6 && Math.abs(normal.y) < 1e-6;
};