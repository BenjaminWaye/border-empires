import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Layout and shared geometry helpers for the scout drone, the "Sentinel"
// (client-map-3d-scout-drone-model.ts): drone-local units, nose toward +Z, up +Y, its left
// toward +X. A panelled sphere (client-map-3d-scout-drone-body.ts) with four short arms out to
// oval rotor pods, each carrying a large three-blade rotor (client-map-3d-scout-drone-pods.ts).
// The pods sit in a wide X: front pods 55 degrees either side of the nose, rear pods 55 degrees
// either side of the tail.

export const SCOUT_BODY_RADIUS = 0.085;
/** Body centre to pod (and rotor) centre, in the horizontal plane. */
export const SCOUT_ARM_REACH = 0.215;
/** Rotor radius: the rotor spans about twice the pod's length. */
export const SCOUT_PROP_RADIUS = 0.1125;
/** Heights above the body centre: the pods' mid-line and the rotors' plane. */
export const SCOUT_POD_Y = 0.008;
export const SCOUT_PROP_Y = 0.033;
/** Half the pod's length (radial) and half its width. */
export const SCOUT_POD = { halfLength: 0.056, halfWidth: 0.03, top: 0.017, bottom: 0.019 } as const;

/** The pods' directions, in radians from the nose toward the drone's left (+X). */
const POD_ANGLES = { frontLeft: 0.96, frontRight: -0.96, rearRight: -2.18, rearLeft: 2.18 } as const;
export type ScoutPodName = keyof typeof POD_ANGLES;
/** Pod order: rotors alternate spin direction around the ring, so diagonal pairs match. */
export const SCOUT_POD_ORDER: readonly ScoutPodName[] = ["frontLeft", "frontRight", "rearRight", "rearLeft"];

export type ScoutPodCentre = { readonly name: ScoutPodName; readonly x: number; readonly z: number; readonly angle: number };
export const scoutPodCentres = (): ScoutPodCentre[] =>
  SCOUT_POD_ORDER.map((name) => {
    const angle = POD_ANGLES[name];
    return { name, x: Math.sin(angle) * SCOUT_ARM_REACH, z: Math.cos(angle) * SCOUT_ARM_REACH, angle };
  });

/** A point on the body sphere (radius `r`) in eye-polar coordinates: `theta` from the nose, `psi` around it from +X toward +Y. */
export const spherePoint = (theta: number, psi: number, r = SCOUT_BODY_RADIUS, out = new Vector3()): Vector3 =>
  out.set(r * Math.sin(theta) * Math.cos(psi), r * Math.sin(theta) * Math.sin(psi), r * Math.cos(theta));

const scratch = new Matrix4();
const unit = new Vector3(1, 1, 1);
export const up = new Vector3(0, 1, 0);

/** A non-indexed copy placed at `pos` with `rot` (and `scale`), ready to merge; drops UVs. */
export const placed = (geometry: BufferGeometry, pos: Vector3, rot: Quaternion = new Quaternion(), scale: Vector3 = unit): BufferGeometry => {
  const clone = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(scratch.compose(pos, rot, scale));
  if (clone.getAttribute("uv")) clone.deleteAttribute("uv");
  return clone;
};

/** Merges parts (all with the same attributes) and disposes them and any `sources`. */
export const merge = (parts: BufferGeometry[], sources: BufferGeometry[] = []): BufferGeometry => {
  const merged = mergeGeometries(parts, false);
  for (const part of [...parts, ...sources]) part.dispose();
  if (!merged) throw new Error("scout drone: geometry merge failed");
  merged.computeBoundingSphere();
  return merged;
};

/** A rod from `from` to `to`, `radius` at `from` tapering to `tipRadius` at `to`. */
export const rod = (from: Vector3, to: Vector3, radius: number, tipRadius = radius, segments = 8): BufferGeometry => {
  const dir = to.clone().sub(from);
  const cylinder = new CylinderGeometry(tipRadius, radius, dir.length(), segments);
  const part = placed(cylinder, from.clone().add(to).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(up, dir.normalize()));
  cylinder.dispose();
  return part;
};

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Bakes ambient occlusion into vertex colours from a shade function of each vertex's position. */
export const bakeOcclusion = (geometry: BufferGeometry, shade: (x: number, y: number, z: number) => number): BufferGeometry => {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const v = shade(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
};
