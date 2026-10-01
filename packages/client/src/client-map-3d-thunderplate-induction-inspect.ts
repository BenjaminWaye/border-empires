// Inspection helpers for the Thunderplate Induction (TPL) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the induction rig is
// a coil of broad rings wrapped tightly around a clamped plate with live arcs
// jumping narrow contact gaps, and a loose bound would over-report everything
// and let the envelope assertions pass on nothing.

import { InstancedMesh, Matrix4, MeshStandardMaterial, Scene, Vector3 } from "three";
import { TPL_ARC, TPL_CAPACITOR, TPL_CAPACITOR_CAP, TPL_CAPACITOR_FIN, TPL_ELECTRODE_COLLAR, TPL_ELECTRODE_COLUMN, TPL_ELECTRODE_HEAD, TPL_PLATE, TPL_PLATE_BLANK } from "./client-map-3d-thunderplate-induction-parts.js";

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

// The heavy unfinished armor blank and its paler inset.
export const plateMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_PLATE.w, TPL_PLATE.h, TPL_PLATE.d));
export const blankMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_PLATE_BLANK.w, TPL_PLATE_BLANK.h, TPL_PLATE_BLANK.d));

// The broad induction coil loops.
export const ringMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), 0.045) && near(numberParam(geo, "tube"), 0.0065));

// The two chunky electrodes and their brass collars and reaching heads.
export const columnMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_ELECTRODE_COLUMN.w, TPL_ELECTRODE_COLUMN.h, TPL_ELECTRODE_COLUMN.d));
export const columnCollarMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_ELECTRODE_COLLAR.w, TPL_ELECTRODE_COLLAR.h, TPL_ELECTRODE_COLLAR.d));
export const headMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_ELECTRODE_HEAD.w, TPL_ELECTRODE_HEAD.h, TPL_ELECTRODE_HEAD.d));

// The cyan-white arc nodes jumping the contact gaps.
export const arcMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_ARC.w, TPL_ARC.h, TPL_ARC.d));

// The compact transformer block behind the assembly.
export const capacitorMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_CAPACITOR.w, TPL_CAPACITOR.h, TPL_CAPACITOR.d));
export const capacitorCapMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_CAPACITOR_CAP.w, TPL_CAPACITOR_CAP.h, TPL_CAPACITOR_CAP.d));
export const capacitorFinMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => box(geo, TPL_CAPACITOR_FIN.w, TPL_CAPACITOR_FIN.h, TPL_CAPACITOR_FIN.d));

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
// column is the ring's scaled normal — for a coil loop its hole must point
// along the plate's long axis.
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