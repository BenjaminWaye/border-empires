import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Quaternion, Shape, SphereGeometry, Vector3 } from "three";
import { bar, flatNormals, hullEdgeLines, loftFaceted, type HullStation } from "./client-map-3d-scout-drone-loft.js";
import { mergeParts, placed } from "./client-map-3d-scout-drone-propulsion.js";
import { applyBoxUvs } from "./client-map-3d-scout-drone-surface.js";

// The scout drone's airframe (client-map-3d-scout-drone-model.ts), drone-local: nose toward +Z,
// up +Y. A hard-surface arrowhead hull lofted from flat facets (two-tone, panelled through
// box-projected UVs), a faceted sensor canopy and belly sensor pod, bronze trim on the ridge and
// chines studded with bolt heads, cyan emissive seams just under the chines, chevron House
// markings on the fins, and greebles: an intake on each chine, dorsal vents, sensor blisters, an
// armoured antenna base and a raised hatch. Static parts are merged per material. Built once.

export const SCOUT_GIMBAL = { y: -0.074, z: 0.16 } as const;
export const SCOUT_TAIL_LIGHT = { y: 0.012, z: -0.25 } as const;
export const SCOUT_BELLY_LIGHT = { y: -0.052, z: -0.06 } as const;
export const SCOUT_ANTENNA_TIP = { y: 0.16, z: -0.11 } as const;
/** Where each skid's hinge sits on the hull side (X is mirrored). */
export const SCOUT_SKID_HINGE = { x: 0.05, y: -0.034 } as const;

/** The arrowhead hull, tail to nose. */
const HULL: readonly HullStation[] = [
  { z: -0.245, halfWidth: 0.034, top: 0.026, chine: 0.002, keel: -0.022 },
  { z: -0.17, halfWidth: 0.058, top: 0.042, chine: 0.002, keel: -0.038 },
  { z: -0.03, halfWidth: 0.088, top: 0.054, chine: 0.0, keel: -0.048 },
  { z: 0.08, halfWidth: 0.074, top: 0.05, chine: -0.004, keel: -0.044 },
  { z: 0.18, halfWidth: 0.042, top: 0.032, chine: -0.01, keel: -0.03 },
  { z: 0.27, halfWidth: 0.004, top: 0.004, chine: -0.014, keel: -0.016 }
];

const CANOPY: readonly HullStation[] = [
  { z: -0.05, halfWidth: 0.022, top: 0.058, chine: 0.048, keel: 0.042 },
  { z: 0.02, halfWidth: 0.034, top: 0.08, chine: 0.056, keel: 0.044 },
  { z: 0.1, halfWidth: 0.026, top: 0.064, chine: 0.052, keel: 0.042 },
  { z: 0.15, halfWidth: 0.006, top: 0.05, chine: 0.046, keel: 0.04 }
];

/** The sensor pod slung under the nose, carrying the gimbal. */
const BELLY_POD: readonly HullStation[] = [
  { z: 0.02, halfWidth: 0.018, top: -0.03, chine: -0.044, keel: -0.05 },
  { z: 0.08, halfWidth: 0.032, top: -0.028, chine: -0.048, keel: -0.064 },
  { z: 0.15, halfWidth: 0.028, top: -0.022, chine: -0.044, keel: -0.06 },
  { z: 0.19, halfWidth: 0.012, top: -0.018, chine: -0.036, keel: -0.044 }
];

// A swept, angular fin with a raked tip and a single chamfer, in its own frame (length along -Z,
// thickness along X), and the two-chevron House marking on both of its faces.
const finShape = (): Shape => {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.085, 0);
  shape.lineTo(0.112, 0.07);
  shape.lineTo(0.088, 0.07);
  shape.lineTo(0.03, 0.012);
  shape.closePath();
  return shape;
};
const chevron = (x: number): Shape => {
  const shape = new Shape();
  shape.moveTo(x, 0.018);
  shape.lineTo(x + 0.012, 0.03);
  shape.lineTo(x, 0.042);
  shape.lineTo(x + 0.006, 0.042);
  shape.lineTo(x + 0.018, 0.03);
  shape.lineTo(x + 0.006, 0.018);
  shape.closePath();
  return shape;
};
const inFinFrame = (geometry: BufferGeometry): BufferGeometry => {
  geometry.rotateY(Math.PI / 2);
  return geometry;
};
const fin = (): BufferGeometry =>
  inFinFrame(new ExtrudeGeometry(finShape(), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 1 }).translate(0, 0, -0.002));
const finMarking = (): BufferGeometry => {
  const faces: BufferGeometry[] = [];
  for (const face of [1, -1]) {
    const marks = new ExtrudeGeometry([chevron(0.048), chevron(0.066)], { depth: 0.0008, bevelEnabled: false });
    faces.push(flatNormals(marks.translate(0, 0, face > 0 ? 0.0036 : -0.0044)));
  }
  return inFinFrame(mergeParts(faces));
};

export type ScoutAirframeGeometry = {
  /** The hull plates: two-tone vertex colours and panel UVs, for the panelled hull material. */
  readonly hull: BufferGeometry;
  readonly steel: BufferGeometry;
  readonly bronze: BufferGeometry;
  readonly glass: BufferGeometry;
  /** Matte black: intake mouths and vent slats. */
  readonly dark: BufferGeometry;
  /** Cyan emissive seams along the chines. */
  readonly seams: BufferGeometry;
};

export const buildScoutAirframe = (): ScoutAirframeGeometry => {
  const hull = applyBoxUvs(loftFaceted(HULL), 3.2);
  const steel: BufferGeometry[] = [loftFaceted(BELLY_POD)];
  const glass: BufferGeometry[] = [loftFaceted(CANOPY)];
  const dark: BufferGeometry[] = [];
  const seams: BufferGeometry[] = [];
  // Bronze trim on the hull's hard edges, with a row of bolt heads along each chine.
  const bronze: BufferGeometry[] = hullEdgeLines(HULL).map(([from, to]) => bar(from, to, 0.0058));
  bronze.push(bar(new Vector3(0, -0.049, -0.14), new Vector3(0, -0.047, 0.1), 0.007)); // keel strake
  const bolt = new CylinderGeometry(0.0032, 0.0032, 0.003, 6);
  for (const [from, to] of hullEdgeLines(HULL)) {
    if (from.x === 0) continue; // chines only, not the ridge
    const side = Math.sign(from.x + to.x);
    for (let t = 0.2; t < 1; t += 0.3) {
      const p = from.clone().lerp(to, t);
      bronze.push(placed(bolt, new Vector3(p.x + side * 0.003, p.y + 0.004, p.z), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side * -0.9)));
    }
    // Cyan seam just under the chine, inset a touch.
    const seamFrom = new Vector3(from.x * 0.97, from.y - 0.007, from.z);
    const seamTo = new Vector3(to.x * 0.97, to.y - 0.007, to.z);
    if (Math.abs(from.z) < 0.24 && Math.abs(to.z) < 0.24) seams.push(bar(seamFrom, seamTo, 0.0028));
  }
  bolt.dispose();
  // Fins with their House marking, canted as a V-tail.
  for (const side of [-1, 1]) {
    const at = new Vector3(side * 0.012, 0.034, -0.15);
    const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side * -0.5);
    steel.push(placed(fin(), at, rot));
    bronze.push(placed(finMarking(), at, rot));
  }
  // Greebles. An intake on each chine just aft of the canopy, a dark mouth inside a steel cowl.
  for (const side of [-1, 1]) {
    steel.push(placed(new BoxGeometry(0.016, 0.02, 0.06), new Vector3(side * 0.084, 0.006, 0.0)));
    dark.push(placed(new BoxGeometry(0.012, 0.014, 0.004), new Vector3(side * 0.084, 0.006, 0.031)));
    // Sensor blisters on the flanks near the nose.
    steel.push(placed(new SphereGeometry(0.009, 5, 3), new Vector3(side * 0.05, 0.012, 0.15)));
    // Dorsal vents: a raised block with three dark slats.
    steel.push(placed(new BoxGeometry(0.026, 0.006, 0.05), new Vector3(side * 0.022, 0.048, -0.1)));
    for (let s = 0; s < 3; s += 1) dark.push(placed(new BoxGeometry(0.02, 0.002, 0.006), new Vector3(side * 0.022, 0.0515, -0.118 + s * 0.018)));
  }
  steel.push(placed(new CylinderGeometry(0.009, 0.012, 0.016, 6), new Vector3(0, 0.054, SCOUT_ANTENNA_TIP.z))); // antenna base
  bronze.push(placed(new CylinderGeometry(0.0018, 0.004, 0.1, 4), new Vector3(0, 0.11, SCOUT_ANTENNA_TIP.z))); // antenna mast
  steel.push(placed(new BoxGeometry(0.03, 0.003, 0.032), new Vector3(0, 0.057, -0.17), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.17))); // dorsal hatch
  return { hull, steel: mergeParts(steel), bronze: mergeParts(bronze), glass: mergeParts(glass), dark: mergeParts(dark), seams: mergeParts(seams) };
};
