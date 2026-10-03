// Inspection helpers for the Hive Mind (HMM) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the hive mind is a
// cluster of small nodes orbiting a faceted orb inside a claw frame with a slim
// tilted scan ring sweeping between them, and a loose bound would over-report
// everything and let the envelope assertions pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
import { HMM_CONDUIT, HMM_CORE, HMM_CRADLE, HMM_RELAY, HMM_SENSOR_RING, HMM_SIGNAL_LIGHT } from "./client-map-3d-hive-mind-parts.js";

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

const box = (geo: Geo, w: number, h: number, d: number): boolean =>
  geo.type === "BoxGeometry" &&
  near(numberParam(geo, "width"), w) &&
  near(numberParam(geo, "height"), h) &&
  near(numberParam(geo, "depth"), d);

// The faceted command orb, the claw arcs and the relays are all polyhedra — the
// orb is the big one, the relays the small ones.
export const coreMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "IcosahedronGeometry" && near(numberParam(geo, "radius"), HMM_CORE.r));
export const relayMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "IcosahedronGeometry" && near(numberParam(geo, "radius"), HMM_RELAY.r));

// The heavy brass support frame claws: a partial torus arc.
export const clawMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), HMM_CRADLE.radius) && near(numberParam(geo, "tube"), HMM_CRADLE.tube));

// The slim rotating scan ring.
export const sensorRingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), HMM_SENSOR_RING.radius) && near(numberParam(geo, "tube"), HMM_SENSOR_RING.tube));

// The thick rigid conduits piping each relay into the orb, and the restrained
// cyan signal lights on the relays' outer faces.
export const conduitMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, HMM_CONDUIT.len, HMM_CONDUIT.thickness, HMM_CONDUIT.thickness));
export const lightMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, HMM_SIGNAL_LIGHT.size, HMM_SIGNAL_LIGHT.size, HMM_SIGNAL_LIGHT.size));

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

// Ring tori align their hole along the piece direction, so the third matrix
// column is the ring's scaled normal.
export const zAxisColumn = (mesh: InstancedMesh, instance: number): Vector3 => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return new Vector3(a[o + 8]!, a[o + 9]!, a[o + 10]!);
};

// The whole 4×4 matrix written for one instance, as read straight from the
// instanced matrix buffer — for comparing a piece before and after an update.
export const matrixAt = (mesh: InstancedMesh, instance: number): number[] => {
  const a = mesh.instanceMatrix.array;
  const o = instance * 16;
  return Array.from(a.slice(o, o + 16));
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