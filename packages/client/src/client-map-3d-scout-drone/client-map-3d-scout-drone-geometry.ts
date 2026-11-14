import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Matrix4,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Geometry for the scout drone (client-map-3d-scout-drone-model.ts), in drone-local units: nose
// toward +Z, up +Y, the fuselage centred on the origin, about 0.55 wide across the ducts. The
// static airframe is merged into one geometry per material so the whole craft is a handful of
// draw calls. Everything here runs once, when the overlay is created.

export const SCOUT_ROTOR_COUNT = 4;
export const SCOUT_ROTOR_REACH = 0.215; // hull centre to duct centre, along each diagonal
export const SCOUT_DUCT_INNER = 0.079;
export const SCOUT_NOSE_Z = 0.2;
export const SCOUT_GIMBAL = { y: -0.05, z: 0.125 } as const;
export const SCOUT_TAIL_LIGHT = { y: 0.012, z: -0.235 } as const;
export const SCOUT_BELLY_LIGHT = { y: -0.047, z: -0.03 } as const;
export const SCOUT_ANTENNA_TIP = { y: 0.142, z: -0.1 } as const;
export const SCOUT_FLATTEN = 0.68; // the fuselage's height-to-width ratio

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
const q = new Quaternion();

/** Bakes position/rotation/scale into a non-indexed clone, ready to merge. */
const placed = (geometry: BufferGeometry, pos: Vector3, rot: Quaternion = q.identity(), scale = new Vector3(1, 1, 1)): BufferGeometry => {
  const clone = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(scratch.compose(pos, rot, scale));
  clone.deleteAttribute("uv");
  return clone;
};

const merge = (parts: BufferGeometry[]): BufferGeometry => {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("scout drone: geometry merge failed");
  merged.computeBoundingSphere();
  return merged;
};

// A tapered, slightly flattened fuselage turned on a lathe: rounded tail, widest just aft of the
// middle, narrowing to the nose ring the sensor dome sits in.
const fuselage = (): BufferGeometry => {
  const profile = [
    [0, -0.24], [0.02, -0.235], [0.036, -0.21], [0.054, -0.15], [0.069, -0.07], [0.076, 0.0],
    [0.074, 0.07], [0.064, 0.13], [0.05, 0.175], [0.04, SCOUT_NOSE_Z]
  ].map(([r, y]) => new Vector2(r!, y!));
  const lathe = new LatheGeometry(profile, 28);
  lathe.rotateX(Math.PI / 2);
  lathe.scale(1, SCOUT_FLATTEN, 1);
  return lathe;
};

// The ring wing around each fan: a rounded intake lip on top flaring inward, a thick shoulder and
// a thin trailing edge underneath, turned on a lathe about the duct's vertical axis.
const duct = (): BufferGeometry =>
  new LatheGeometry(
    [
      [SCOUT_DUCT_INNER + 0.0015, -0.015], [SCOUT_DUCT_INNER, -0.003], [SCOUT_DUCT_INNER + 0.0008, 0.009],
      [SCOUT_DUCT_INNER + 0.004, 0.0155], [SCOUT_DUCT_INNER + 0.0085, 0.017], [SCOUT_DUCT_INNER + 0.0115, 0.012],
      [SCOUT_DUCT_INNER + 0.011, 0.0], [SCOUT_DUCT_INNER + 0.008, -0.011], [SCOUT_DUCT_INNER + 0.004, -0.0165],
      [SCOUT_DUCT_INNER + 0.0015, -0.015]
    ].map(([r, y]) => new Vector2(r!, y!)),
    36
  );

// A swept tail fin, extruded with a small bevel; laid along -Z, thickness along X.
const fin = (): BufferGeometry => {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.075, 0);
  shape.lineTo(0.1, 0.062);
  shape.lineTo(0.072, 0.064);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0025, bevelSegments: 2 });
  geometry.translate(0, 0, -0.002);
  geometry.rotateY(Math.PI / 2);
  return geometry;
};

export type ScoutAirframeGeometry = {
  readonly steel: BufferGeometry;
  readonly bronze: BufferGeometry;
  readonly glass: BufferGeometry;
};

export const buildScoutAirframe = (): ScoutAirframeGeometry => {
  const origin = new Vector3();
  const up = new Vector3(0, 1, 0);
  const steel: BufferGeometry[] = [placed(fuselage(), origin)];
  const bronze: BufferGeometry[] = [];
  const glass: BufferGeometry[] = [];

  // Dorsal sensor bay (glass blister) and the smoked nose dome.
  const blister = new SphereGeometry(0.042, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  glass.push(placed(blister, new Vector3(0, 0.044, 0.035), q.identity(), new Vector3(0.78, 0.55, 1.55)));
  const dome = new SphereGeometry(0.041, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  glass.push(placed(dome, new Vector3(0, 0, SCOUT_NOSE_Z - 0.002), q.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2), new Vector3(1, 1, SCOUT_FLATTEN)));
  // Bronze trim: nose ring, a dorsal spine, a belly keel.
  bronze.push(placed(new TorusGeometry(0.04, 0.0045, 8, 28), new Vector3(0, 0, SCOUT_NOSE_Z), q.identity(), new Vector3(1, SCOUT_FLATTEN, 1)));
  bronze.push(placed(new BoxGeometry(0.01, 0.007, 0.2), new Vector3(0, 0.052, -0.09)));
  bronze.push(placed(new BoxGeometry(0.008, 0.008, 0.2), new Vector3(0, -0.051, -0.02)));
  // V-tail fins.
  for (const side of [-1, 1]) {
    const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), side * -0.5);
    steel.push(placed(fin(), new Vector3(side * 0.01, 0.032, -0.15), rot));
  }
  // Antenna mast, tapered.
  bronze.push(placed(new CylinderGeometry(0.0018, 0.004, 0.1, 6), new Vector3(0, 0.092, -0.1)));

  const ductGeometry = duct();
  const lipGeometry = new TorusGeometry(SCOUT_DUCT_INNER + 0.0055, 0.0032, 6, 36);
  lipGeometry.rotateX(Math.PI / 2);
  const strutGeometry = new CylinderGeometry(0.008, 0.013, 1, 8);
  const podGeometry = new CapsuleGeometry(0.014, 0.034, 4, 12);
  const spokeGeometry = new BoxGeometry(SCOUT_DUCT_INNER - 0.012, 0.004, 0.006);
  for (const { x, z, angle } of scoutRotorCentres()) {
    const centre = new Vector3(x, 0.012, z);
    steel.push(placed(ductGeometry, centre));
    bronze.push(placed(lipGeometry, new Vector3(x, 0.012 + 0.0165, z)));
    // A strut from the hull side out to the duct, tapering toward the duct, with a slight dihedral.
    const from = new Vector3(Math.sin(angle) * 0.045, 0.0, Math.cos(angle) * 0.045);
    const to = new Vector3(x * (1 - SCOUT_DUCT_INNER / SCOUT_ROTOR_REACH), 0.01, z * (1 - SCOUT_DUCT_INNER / SCOUT_ROTOR_REACH));
    const dir = to.clone().sub(from);
    const length = dir.length();
    bronze.push(placed(strutGeometry, from.clone().add(to).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(up, dir.normalize()), new Vector3(1, length, 1)));
    // Motor pod on three spokes.
    steel.push(placed(podGeometry, new Vector3(x, 0.006, z)));
    for (let s = 0; s < 3; s += 1) {
      const spokeAngle = angle + (s * Math.PI * 2) / 3;
      const mid = (SCOUT_DUCT_INNER + 0.012) / 2;
      steel.push(placed(spokeGeometry, new Vector3(x + Math.cos(spokeAngle) * mid, -0.004, z - Math.sin(spokeAngle) * mid), new Quaternion().setFromAxisAngle(up, spokeAngle)));
    }
  }
  for (const g of [blister, dome, ductGeometry, lipGeometry, strutGeometry, podGeometry, spokeGeometry]) g.dispose();
  return { steel: merge(steel), bronze: merge(bronze), glass: merge(glass) };
};

/** One rotor's three twisted blades, around the origin in the XZ plane. */
export const buildScoutRotorBlades = (): BufferGeometry => {
  const blade = new BoxGeometry(SCOUT_DUCT_INNER - 0.012, 0.0028, 0.016);
  const parts: BufferGeometry[] = [];
  for (let b = 0; b < 3; b += 1) {
    const angle = (b * Math.PI * 2) / 3;
    const twist = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.32));
    const radius = (SCOUT_DUCT_INNER - 0.012) / 2 + 0.012;
    parts.push(placed(blade, new Vector3(Math.cos(angle) * radius, 0, -Math.sin(angle) * radius), twist));
  }
  blade.dispose();
  return merge(parts);
};

/** The motion-blur disc that replaces the blades at speed. */
export const buildScoutRotorDisc = (): BufferGeometry => {
  const disc = new CircleGeometry(SCOUT_DUCT_INNER - 0.002, 36);
  disc.rotateX(-Math.PI / 2);
  return disc;
};

export type ScoutGimbalGeometry = { readonly yoke: BufferGeometry; readonly ball: BufferGeometry; readonly lens: BufferGeometry };

/** The sensor gimbal: a bronze yoke (pans), a steel ball (tilts) and its lens facing +Z. */
export const buildScoutGimbal = (): ScoutGimbalGeometry => {
  const yoke = new TorusGeometry(0.024, 0.0045, 8, 20, Math.PI);
  yoke.rotateZ(Math.PI);
  yoke.rotateY(Math.PI / 2);
  const ball = new SphereGeometry(0.02, 20, 14);
  const lens = new CylinderGeometry(0.0115, 0.0125, 0.012, 20);
  lens.rotateX(Math.PI / 2);
  lens.translate(0, 0, 0.017);
  return { yoke, ball, lens };
};
