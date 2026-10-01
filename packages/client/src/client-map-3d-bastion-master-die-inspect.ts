// Inspection helpers for the Bastion Master-Die (BMD) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the press is a stack
// of broad angular armor slabs and a seam-lit bite separated by thin gaps, and
// a loose bound would over-report everything and let the dock-envelope
// assertions pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
// CAD constants read by the probes.
import { BMD_COUPLING_TIP, BMD_FEED, BMD_HEADER, BMD_LEG, BMD_LEG_CAP, BMD_LOWER_DIE, BMD_RAM, BMD_RAM_COLLAR, BMD_SEAM, BMD_UPPER_DIE } from "./client-map-3d-bastion-master-die-parts.js";

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

// The two opposing armor platen slabs of the press and the heat seam between
// them.
export const lowerDieMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, BMD_LOWER_DIE.w, BMD_LOWER_DIE.h, BMD_LOWER_DIE.d));
export const upperDieMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, BMD_UPPER_DIE.w, BMD_UPPER_DIE.h, BMD_UPPER_DIE.d));
export const seamMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, BMD_SEAM.w, BMD_SEAM.h, BMD_SEAM.d));

// The oversized hydraulic ram, its brass collar, and the crown header.
export const ramMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), BMD_RAM.radius) && near(numberParam(geo, "height"), 1));
export const ramCollarMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), BMD_RAM_COLLAR.radius) && near(numberParam(geo, "tube"), BMD_RAM_COLLAR.tube));
export const headerMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, BMD_HEADER.w, BMD_HEADER.h, BMD_HEADER.d));

// The two hydraulic legs and their brass caps.
export const legMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), BMD_LEG.radius) && near(numberParam(geo, "height"), 1));
export const legCapMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), BMD_LEG_CAP.radius) && near(numberParam(geo, "height"), 1));

// The reinforced feed slot and its brass cheeks.
export const feedMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, BMD_FEED.w, BMD_FEED.h, BMD_FEED.d));
export const feedCheekMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, 0.02, 0.012, 0.012));

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
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.016) && near(numberParam(geo, "radiusTop"), BMD_COUPLING_TIP.radius));

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