// Inspection helpers for the Matterwright Retort (MWR) module.
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
// its side (a rod, a ring, a funnel) would otherwise be over-reported, and the
// dock-envelope assertions these helpers feed are exactly the kind that would
// silently pass on a loose bound.

import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";

export const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

type Geo = { type: string; parameters: Record<string, unknown> };
export const params = (mesh: InstancedMesh): Geo => mesh.geometry as unknown as Geo;

export const findByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find((mesh) => match(params(mesh)));

// The oversized pressure vessel.
export const retortMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "SphereGeometry" && (geo.parameters as { radius: number }).radius === 0.082);

// The low blackened pod the vessel is cast onto.
export const podMesh = (scene: Scene): InstancedMesh | undefined => findByParams(scene, (geo) => geo.type === "CapsuleGeometry");

// The glowing reaction seam around the vessel's waist.
export const seamMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && (geo.parameters as { radius: number }).radius === 0.0835);

export const bandMesh = (scene: Scene, radius: number): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && (geo.parameters as { radius: number }).radius === radius);

// The two small condenser tanks and their sight-glasses.
export const condenserMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { height: number }).height === 0.042);
export const condenserGlassMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && (geo.parameters as { radius: number }).radius === 0.0245);

// The short heavy pipes from the vessel into the condensers.
export const pipeMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { height: number }).height === 1 && (geo.parameters as { radiusTop: number }).radiusTop === 0.009);

// The chunky pressure valve: stem, handwheel and its four spokes.
export const valveWheelMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && (geo.parameters as { radius: number }).radius === 0.015);
export const valveStemMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { height: number }).height === 1 && (geo.parameters as { radiusTop: number }).radiusTop === 0.008);
export const spokeMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { height: number }).height === 1 && (geo.parameters as { radiusTop: number }).radiusTop === 0.002);

// The reinforced feed port, pointing forward off the vessel's lower flank.
export const feedFunnelMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && (geo.parameters as { radiusTop: number }).radiusTop === 0.02 && (geo.parameters as { height: number }).height === 0.026);

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

// A world point's position inside the retort's hull. The instance matrix
// carries the geometry radius and the Y squash, so mapping a point back through
// it lands in the vessel's own geometry space — where the hull is the
// SphereGeometry's radius, not the unit sphere.
const RETORT_RADIUS = 0.082;
export const insideRetort = (retort: InstancedMesh, world: Vector3): boolean => {
  const inv = matrixAt(retort, 0).invert();
  return world.clone().applyMatrix4(inv).length() < RETORT_RADIUS;
};
