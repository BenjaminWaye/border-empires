import { BoxGeometry, BufferGeometry, CircleGeometry, CylinderGeometry, LatheGeometry, Matrix4, PlaneGeometry, Quaternion, SphereGeometry, Vector2, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bar, flatNormals } from "./client-map-3d-scout-drone-loft.js";

// The scout drone's ducted fans, sensor gimbal and landing skids (client-map-3d-scout-drone-model.ts),
// in drone-local units around each part's own origin. Hard-surface throughout: chamfered octagonal
// duct cowls with a bronze lip, an inner stator ring on six guide vanes around a hexagonal motor
// hub, five-blade twisted rotors with tapered tips, an octagonal blur disc, exhaust glow quads
// under the ducts, and skids that fold up against the hull after launch. Built once.

export const SCOUT_ROTOR_COUNT = 4;
export const SCOUT_ROTOR_REACH = 0.225; // hull centre to duct centre, along each diagonal
export const SCOUT_DUCT_INNER = 0.08;
export const OCTAGON_PHI = Math.PI / 8;

/** Duct centres in drone-local X/Z (front-right, front-left, rear-left, rear-right). */
export const scoutRotorCentres = (): Array<{ x: number; z: number; angle: number }> => {
  const centres: Array<{ x: number; z: number; angle: number }> = [];
  for (let k = 0; k < SCOUT_ROTOR_COUNT; k += 1) {
    const angle = Math.PI / 4 + (k * Math.PI) / 2;
    centres.push({ x: Math.sin(angle) * SCOUT_ROTOR_REACH, z: Math.cos(angle) * SCOUT_ROTOR_REACH, angle });
  }
  return centres;
};

const scratch = new Matrix4();
const one = new Vector3(1, 1, 1);
const up = new Vector3(0, 1, 0);

/** A flat-shaded, uv-free, non-indexed copy placed at `pos` with `rot`, ready to merge. */
export const placed = (geometry: BufferGeometry, pos: Vector3, rot: Quaternion = new Quaternion(), scale: Vector3 = one): BufferGeometry => {
  const clone = flatNormals(geometry.clone()).applyMatrix4(scratch.compose(pos, rot, scale));
  if (clone.getAttribute("uv")) clone.deleteAttribute("uv");
  return clone;
};

export const mergeParts = (parts: BufferGeometry[]): BufferGeometry => {
  for (const part of parts) {
    if (part.getAttribute("uv")) part.deleteAttribute("uv");
    if (part.getAttribute("color")) part.deleteAttribute("color");
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("scout drone: geometry merge failed");
  merged.computeBoundingSphere();
  return merged;
};

const octagonLathe = (profile: ReadonlyArray<readonly [number, number]>): BufferGeometry =>
  new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 8, OCTAGON_PHI);

const I = SCOUT_DUCT_INNER;

/** The duct cowl around one fan: a thick octagonal ring with chamfered (micro-bevelled) edges. */
export const buildDuctCowl = (): BufferGeometry =>
  octagonLathe([[I, -0.017], [I, 0.015], [I + 0.004, 0.02], [I + 0.017, 0.02], [I + 0.022, 0.015], [I + 0.022, -0.012], [I + 0.016, -0.019], [I + 0.003, -0.019], [I, -0.017]]);

/** The bronze lip capping the cowl, plus the inner stator ring, vanes and motor hub. */
export const buildDuctInternals = (): { lip: BufferGeometry; stator: BufferGeometry } => {
  const lip = octagonLathe([[I + 0.003, 0.02], [I + 0.003, 0.0235], [I + 0.018, 0.0235], [I + 0.018, 0.02], [I + 0.003, 0.02]]);
  const parts: BufferGeometry[] = [];
  parts.push(placed(octagonLathe([[0.03, -0.014], [0.03, -0.004], [0.036, -0.004], [0.036, -0.014], [0.03, -0.014]]), new Vector3()));
  const vane = new BoxGeometry(I - 0.034, 0.012, 0.003);
  for (let v = 0; v < 6; v += 1) {
    const a = (v * Math.PI) / 3;
    const rot = new Quaternion().setFromAxisAngle(up, a).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4));
    const mid = (I + 0.034) / 2;
    parts.push(placed(vane, new Vector3(Math.cos(a) * mid, -0.01, -Math.sin(a) * mid), rot));
  }
  parts.push(placed(new CylinderGeometry(0.015, 0.018, 0.034, 6), new Vector3(0, 0.0, 0)));
  parts.push(placed(new CylinderGeometry(0.004, 0.012, 0.012, 6), new Vector3(0, 0.023, 0)));
  vane.dispose();
  return { lip: placed(lip, new Vector3()), stator: mergeParts(parts) };
};

/** One rotor: five twisted, tapered blades around the origin in the XZ plane. */
export const buildScoutRotorBlades = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  const root = new BoxGeometry(0.032, 0.003, 0.019);
  const tip = new BoxGeometry(0.03, 0.0024, 0.012);
  for (let b = 0; b < 5; b += 1) {
    const a = (b * Math.PI * 2) / 5;
    const along = (r: number): Vector3 => new Vector3(Math.cos(a) * r, 0, -Math.sin(a) * r);
    const twist = (pitch: number): Quaternion => new Quaternion().setFromAxisAngle(up, a).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch));
    parts.push(placed(root, along(0.034), twist(0.5)));
    parts.push(placed(tip, along(0.064), twist(0.22)));
  }
  root.dispose();
  tip.dispose();
  return mergeParts(parts);
};

/** The motion-blur disc that takes over from the blades at speed (octagonal, inside the cowl). */
export const buildScoutRotorDisc = (): BufferGeometry => {
  const disc = new CircleGeometry(I - 0.002, 8, OCTAGON_PHI);
  disc.rotateX(-Math.PI / 2);
  return disc;
};

/** One glow quad under each duct (drone-local), merged: the exhaust wash, lit from below. */
export const buildScoutExhaust = (centres: ReadonlyArray<{ x: number; z: number }>, y: number): BufferGeometry => {
  const quad = new PlaneGeometry(0.2, 0.2);
  quad.rotateX(Math.PI / 2); // faces down
  const parts = centres.map(({ x, z }) => quad.clone().translate(x, y, z));
  quad.dispose();
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("scout drone: exhaust merge failed");
  return merged;
};

export type ScoutGimbalGeometry = { readonly yoke: BufferGeometry; readonly ball: BufferGeometry; readonly lens: BufferGeometry };

/** The sensor gimbal: an angular bronze yoke (pans), a faceted turret (tilts) and its lens facing +Z. */
export const buildScoutGimbal = (): ScoutGimbalGeometry => {
  const yoke = mergeParts([
    placed(new BoxGeometry(0.06, 0.006, 0.014), new Vector3(0, 0.022, 0)),
    placed(new BoxGeometry(0.006, 0.026, 0.014), new Vector3(-0.027, 0.01, 0)),
    placed(new BoxGeometry(0.006, 0.026, 0.014), new Vector3(0.027, 0.01, 0))
  ]);
  const ball = flatNormals(new SphereGeometry(0.021, 8, 5));
  const lens = flatNormals(new CylinderGeometry(0.0115, 0.0125, 0.012, 8));
  lens.rotateX(Math.PI / 2);
  lens.translate(0, 0, 0.017);
  return { yoke, ball, lens };
};

/**
 * One landing skid, in its own frame: the hinge runs along Z at the origin; two struts drop to a
 * chamfered rail with upturned ends. The model rotates it about Z to fold it up after launch.
 */
export const buildScoutSkid = (side: 1 | -1): BufferGeometry => {
  const foot = (z: number): Vector3 => new Vector3(side * 0.03, -0.06, z);
  const parts: BufferGeometry[] = [
    bar(new Vector3(0, 0, 0.07), foot(0.07), 0.007),
    bar(new Vector3(0, 0, -0.07), foot(-0.07), 0.007),
    bar(foot(-0.12), foot(0.11), 0.009),
    bar(foot(0.11), new Vector3(side * 0.03, -0.05, 0.135), 0.008),
    bar(foot(-0.12), new Vector3(side * 0.03, -0.052, -0.14), 0.008)
  ];
  return mergeParts(parts);
};
