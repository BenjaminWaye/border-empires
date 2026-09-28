// Inspection helpers for the Umbrite Synthesis (UMB) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: a piece rotated onto
// its side (the barrel, a rod, a ring) would otherwise be over-reported, and the
// dock-envelope assertions these helpers feed are exactly the kind that would
// silently pass on a loose bound.

import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";

export const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

type Geo = { type: string; parameters: Record<string, unknown> };
export const params = (mesh: InstancedMesh): Geo => mesh.geometry as unknown as Geo;

export const findByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find((mesh) => match(params(mesh)));

// Part radii are written as sums in the catalogue (a hoop is the barrel's radius
// plus its own tube clearance), so they arrive as 0.052000000000000005 rather
// than 0.052. Every geometry-parameter match here has to tolerate that.
const near = (actual: unknown, expected: number): boolean => typeof actual === "number" && Math.abs(actual - expected) < 1e-6;

const numberParam = (geo: Geo, key: string): number | undefined => geo.parameters[key] as number | undefined;

// The horizontal pressure barrel — the 0.145-long cylinder laid across the pod.
export const chamberMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.138));

// The dense violet-black Umbrite suspended inside the barrel.
export const umbriteCoreMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.126));

// The three heavy brass compression hoops clamping the barrel.
export const chamberRingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), 0.052));

// The two injector cylinders at the barrel's ends.
export const injectorMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.026) && near(numberParam(geo, "radiusTop"), 0.02));

// The low purple ring where material enters the vessel.
export const injectorRingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), 0.016));

// The low blackened pod the barrel is mounted through.
export const podMesh = (scene: Scene): InstancedMesh | undefined => findByParams(scene, (geo) => geo.type === "CapsuleGeometry");

// The chunky pressure-control assembly: manifold, dial bezel, face and needle.
export const manifoldMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), 0.024));
export const gaugeFaceMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.006));
export const needleMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "radiusTop"), 0.002));

// The short reinforced feed runs bracing the injectors to the pod.
export const feedPipeMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 1) && near(numberParam(geo, "radiusTop"), 0.008));

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

const matrixAt = (mesh: InstancedMesh, instance: number): Matrix4 => {
  const m = new Matrix4();
  mesh.getMatrixAt(instance, m);
  return m;
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

// A world point's position inside the barrel's shell. The instance matrix
// carries the quarter turn that lays the cylinder down, so mapping a point back
// through it lands in the shell's own geometry space — where the hull is the
// CylinderGeometry's radius, not the unit cylinder.
const BARREL_RADIUS = 0.05;
export const insideBarrel = (barrel: InstancedMesh, world: Vector3): boolean => {
  const inv = matrixAt(barrel, 0).invert();
  return world.clone().applyMatrix4(inv).length() < BARREL_RADIUS;
};
