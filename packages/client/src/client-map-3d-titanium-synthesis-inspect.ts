// Inspection helpers for the Titanium Synthesis (TIT) module.
//
// The module renders as a set of InstancedMeshes with one mesh per part type and
// no per-piece object handles, so asserting on it means two things: locating a
// piece in the scene graph, and measuring it through the instance matrices that
// were actually written. Both live here, because that is a coherent unit of work
// in its own right — a scene probe — and it is the only place that needs to know
// how the module names and proportions its parts.
//
// Measurement is deliberately done over the real matrices and the transformed
// tessellated vertices rather than over a bounding sphere: the feed pipes are
// unit rods stretched onto a tilt, the hoops and rings are tori turned onto
// other axes, and a loose bound would over-report every one of them and let the
// dock-envelope assertions pass on nothing.

import { InstancedMesh, Matrix4, Scene, Vector3 } from "three";
import { TIT_BAND, TIT_CAP, TIT_CRUCIBLE, TIT_INJECTOR, TIT_PIPE, TIT_SLIT, TIT_VALVE } from "./client-map-3d-titanium-synthesis-parts.js";

export const instancedMeshes = (scene: Scene): InstancedMesh[] =>
  scene.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);

type Geo = { type: string; parameters: Record<string, unknown> };
export const params = (mesh: InstancedMesh): Geo => mesh.geometry as unknown as Geo;

export const findByParams = (scene: Scene, match: (geo: Geo) => boolean): InstancedMesh | undefined =>
  instancedMeshes(scene).find((mesh) => match(params(mesh)));

// Part radii are written as sums in the catalogue (a hoop is the shell's radius
// plus its own tube clearance), so they arrive as 0.04800000000000001 rather
// than 0.048. Every geometry-parameter match here has to tolerate that.
const near = (actual: unknown, expected: number): boolean => typeof actual === "number" && Math.abs(actual - expected) < 1e-6;

const numberParam = (geo: Geo, key: string): number | undefined => geo.parameters[key] as number | undefined;

// The vertical pressure crucible — the 0.145-tall vessel rising from the pod.
export const crucibleMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), TIT_CRUCIBLE.height) && near(numberParam(geo, "radiusTop"), TIT_CRUCIBLE.radius));

// The three broad brass compression hoops, and the cap ring closing the mouth
// (same radius as a hoop, thicker tube).
export const crucibleBandMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), TIT_BAND.radius) && near(numberParam(geo, "tube"), TIT_BAND.tube));
export const capRingMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), TIT_CAP.radius) && near(numberParam(geo, "tube"), TIT_CAP.tube));

// The narrow reinforced viewing slit: its dark steel frame and the white-hot bar
// inside it, told apart by width.
export const slitFrameMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "BoxGeometry" && near(numberParam(geo, "width"), TIT_SLIT.frameWidth));
export const slitGlowMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "BoxGeometry" && near(numberParam(geo, "width"), TIT_SLIT.glowWidth));

// The two opposed injector bodies, their brass bands, the valve handwheels, and
// the short heavy feed runs.
export const injectorMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), TIT_INJECTOR.length) && near(numberParam(geo, "radiusTop"), TIT_INJECTOR.radius));
export const injectorBandMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), TIT_INJECTOR.radius + 0.002) && near(numberParam(geo, "tube"), 0.005));
export const valveKnobMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "TorusGeometry" && near(numberParam(geo, "radius"), TIT_VALVE.knobRadius) && near(numberParam(geo, "tube"), TIT_VALVE.knobTube));
export const feedPipeMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 1) && near(numberParam(geo, "radiusTop"), TIT_PIPE.radius));

// The low blackened pod, and the dockable seat beneath it.
export const podMesh = (scene: Scene): InstancedMesh | undefined => findByParams(scene, (geo) => geo.type === "CapsuleGeometry");
export const baseMesh = (scene: Scene): InstancedMesh | undefined =>
  findByParams(scene, (geo) => geo.type === "CylinderGeometry" && near(numberParam(geo, "height"), 0.032));

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

// Whether the crucible actually STANDS UP. The vessel is written with no
// rotation, so its +Y axis column has to stay near world +Y. This is the
// assertion that makes the family vertical: a mutation that lays the crucible
// on its side leaves every geometry parameter identical — the cylinder is still
// 0.145 tall and 0.045 round — and only this check catches it. Silhouette is the
// entire point of this module, so a suite that could not tell a standing vessel
// from a lying one would be pinning nothing that matters.
export const crucibleStandsVertical = (mesh: InstancedMesh, instance = 0): boolean => {
  const axis = yAxisColumn(mesh, instance);
  return Math.abs(axis.x) < 1e-6 && Math.abs(axis.z) < 1e-6 && axis.y > 0;
};

// Whether a ring's hole is aligned to the world vertical, i.e. it is a band
// wrapped AROUND the crucible rather than a ring slipped down onto it. A hoop
// with its hole along Z would stand on edge and read as a fence rail.
export const bandWrapsVertical = (mesh: InstancedMesh, instance = 0): boolean => {
  const normal = zAxisColumn(mesh, instance);
  return Math.abs(normal.x) < 1e-6 && Math.abs(normal.y) > 0.99 && Math.abs(normal.z) < 1e-6;
};

// The world height of the crucible's mouth, taken from the instance matrix
// rather than from the published constant, so the published constant is checked
// against the geometry instead of against itself.
export const crucibleMouthHeight = (mesh: InstancedMesh, instance = 0): number => {
  const attr = mesh.geometry.getAttribute("position");
  const m = matrixAt(mesh, instance);
  const v = new Vector3();
  let top = -Infinity;
  for (let k = 0; k < attr.count; k += 1) {
    v.fromBufferAttribute(attr, k).applyMatrix4(m);
    top = Math.max(top, v.y);
  }
  return top;
};

// The slit's glow, and whether it is hot: a high emissive intensity on a
// near-white body colour. If this drops, the module stops being "titanium
// forming under extreme heat" and becomes another dark pressure vessel.
export const glowIsWhiteHot = (mesh: InstancedMesh): boolean => {
  const material = mesh.material as { emissive?: { getHexString: () => string }; emissiveIntensity?: number; color?: { getHexString: () => string } };
  const intensity = material.emissiveIntensity ?? 0;
  const body = material.color?.getHexString() ?? "";
  // A near-white body: every channel high. An orange-hot body would fail here.
  const channels = [0, 2, 4].map((i) => parseInt(body.slice(i, i + 2), 16));
  return intensity >= 2.5 && channels.every((c) => c >= 200);
};
