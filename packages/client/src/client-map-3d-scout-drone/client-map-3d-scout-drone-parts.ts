import { BufferGeometry, CapsuleGeometry, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Quaternion, RingGeometry, Shape, SphereGeometry, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SCOUT_PROP_RADIUS, merge, placed, rod } from "./client-map-3d-scout-drone-geometry.js";

// The Survey Quad's moving parts (client-map-3d-scout-drone-model.ts), each around its own pivot:
// the props (aerofoil blades and the blur disc they become at speed), the 3-axis camera gimbal and
// the landing gear. Built once.

// A thin aerofoil section (rounded leading edge, sharp trailing edge), chord along X, thickness Y.
const aerofoil = (chord: number): Shape => {
  const points: ReadonlyArray<readonly [number, number]> = [
    [-0.5, 0], [-0.44, 0.05], [-0.25, 0.085], [0.05, 0.07], [0.5, 0.004], [0.06, -0.015], [-0.25, -0.03], [-0.44, -0.02]
  ];
  const shape = new Shape();
  points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x * chord, y * chord) : shape.lineTo(x * chord, y * chord)));
  shape.closePath();
  return shape;
};

/** One prop: two slim aerofoil blades, pitched more at the root than the tip, and a small hub. */
export const buildScoutPropBlades = (): BufferGeometry => {
  const parts: BufferGeometry[] = [];
  // Each blade in two spans, root and tip, each extruded along its span then turned to run along +X.
  const span = (chord: number, length: number, from: number, pitch: number, side: 1 | -1): BufferGeometry => {
    const g = new ExtrudeGeometry(aerofoil(chord), { depth: length, bevelEnabled: false });
    g.rotateY(Math.PI / 2); // span along +X, chord along -Z
    g.rotateX(pitch);
    g.translate(from, 0, 0);
    if (side < 0) g.rotateY(Math.PI);
    const part = placed(g, new Vector3());
    g.dispose();
    return part;
  };
  for (const side of [1, -1] as const) parts.push(span(0.017, 0.038, 0.008, 0.34, side), span(0.011, 0.04, 0.046, 0.16, side));
  const hub = new CylinderGeometry(0.0075, 0.0085, 0.006, 10);
  parts.push(placed(hub, new Vector3()));
  return merge(parts, [hub]);
};

/** The blur disc the blades become at speed. */
export const buildScoutPropDisc = (): BufferGeometry => {
  const disc = new CircleGeometry(SCOUT_PROP_RADIUS, 28);
  disc.rotateX(-Math.PI / 2);
  return disc;
};

/** Where the tilt axis sits below the pan pivot, and where the REC light sits on the camera. */
export const SCOUT_GIMBAL_TILT_Y = -0.006;
export const SCOUT_REC_LIGHT = { x: 0.012, y: 0.0165, z: -0.006 } as const;
export const SCOUT_LENS_Z = 0.0315;

export type ScoutGimbalGeometry = {
  /** Pan stage: stem, pan motor, roll arm and tilt motor housing (satin black). */
  readonly yoke: BufferGeometry;
  /** Tilt stage: the rounded camera body (graphite). */
  readonly camera: BufferGeometry;
  /** The lens barrel (aluminium). */
  readonly barrel: BufferGeometry;
  /** The outer front glass (clear, with a soft reflection). */
  readonly glass: BufferGeometry;
  /** The inner element seen through the glass (emissive cyan). */
  readonly iris: BufferGeometry;
  /** The dark iris ring around the inner element, recessed in the barrel. */
  readonly irisRing: BufferGeometry;
};

/** A believable 3-axis gimbal: motor housings at the pan and tilt joints and a rounded camera with a lens barrel. */
export const buildScoutGimbal = (): ScoutGimbalGeometry => {
  const along = (axis: Vector3): Quaternion => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis);
  const housing = new CylinderGeometry(0.0095, 0.0095, 0.01, 12);
  const yoke = merge([
    rod(new Vector3(0, 0.074, 0), new Vector3(0, 0.024, 0), 0.0045, 0.0045, 8), // stem down from the shell's underside
    placed(housing, new Vector3(0, 0.018, 0)), // pan motor
    rod(new Vector3(0, 0.012, 0), new Vector3(0.026, 0.012, 0), 0.0028, 0.0028, 6), // roll arm
    rod(new Vector3(0.026, 0.012, 0), new Vector3(0.026, SCOUT_GIMBAL_TILT_Y, 0), 0.0028, 0.0028, 6),
    placed(housing, new Vector3(0.022, SCOUT_GIMBAL_TILT_Y, 0), along(new Vector3(1, 0, 0))) // tilt motor
  ], [housing]);
  const body = new RoundedBoxGeometry(0.034, 0.029, 0.036, 1, 0.009);
  const camera = placed(body, new Vector3());
  body.dispose();
  const barrelGeometry = new CylinderGeometry(0.011, 0.0125, 0.016, 16, 1, true);
  const barrel = placed(barrelGeometry, new Vector3(0, 0, 0.0235), along(new Vector3(0, 0, 1)));
  barrelGeometry.dispose();
  // The lens in three layers: outer glass at the barrel's mouth; behind it, recessed, a dark iris
  // ring around a small cyan inner element.
  const glassGeometry = new CircleGeometry(0.0108, 20);
  const glass = placed(glassGeometry, new Vector3(0, 0, SCOUT_LENS_Z));
  glassGeometry.dispose();
  const elementGeometry = new CircleGeometry(0.0042, 16);
  const iris = placed(elementGeometry, new Vector3(0, 0, SCOUT_LENS_Z - 0.0055));
  elementGeometry.dispose();
  const ringGeometry = new RingGeometry(0.0042, 0.0112, 20);
  const irisRing = placed(ringGeometry, new Vector3(0, 0, SCOUT_LENS_Z - 0.0056));
  ringGeometry.dispose();
  return { yoke, camera, barrel, glass, iris, irisRing };
};

/**
 * One landing leg, in its own frame: the hinge runs along Z at the origin. Two struts drop, kink
 * outward at a rounded knee, and meet a foot bar running fore and aft; the bar ends in small
 * rubber caps. The model folds it up after launch.
 */
export const buildScoutLeg = (side: 1 | -1): { readonly strut: BufferGeometry; readonly rubber: BufferGeometry } => {
  const knee = new Vector3(side * 0.03, -0.05, 0);
  const foot = new Vector3(side * 0.04, -0.118, 0);
  const kneeBall = new SphereGeometry(0.0062, 10, 6);
  const parts: BufferGeometry[] = [];
  for (const z of [-0.03, 0.03]) {
    parts.push(rod(new Vector3(0, 0, z), knee.clone().setZ(z), 0.0055, 0.0052, 8));
    parts.push(placed(kneeBall, knee.clone().setZ(z)));
    parts.push(rod(knee.clone().setZ(z), foot.clone().setZ(z), 0.0052, 0.0046, 8));
  }
  parts.push(rod(foot.clone().setZ(-0.078), foot.clone().setZ(0.078), 0.0052, 0.0052, 8));
  // Rubber end caps: short rounded sleeves over each end of the foot bar.
  const sleeve = new CapsuleGeometry(0.0068, 0.012, 2, 8);
  const alongZ = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(0, 0, 1));
  const rubber = merge([placed(sleeve, foot.clone().setZ(0.082), alongZ), placed(sleeve, foot.clone().setZ(-0.082), alongZ)], [sleeve]);
  return { strut: merge(parts, [kneeBall]), rubber };
};
