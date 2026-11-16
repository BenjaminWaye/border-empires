import { BoxGeometry, BufferGeometry, CircleGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, Quaternion, SphereGeometry, Vector2, Vector3 } from "three";
import { SCOUT_BODY_RADIUS, bakeOcclusion, merge, placed, rod, smoothstep, spherePoint } from "./client-map-3d-scout-drone-geometry.js";

// The Sentinel's body (client-map-3d-scout-drone-model.ts): a sphere built from a few large
// painted panels -- four around the eye, two staggered bands of four and a rear cap --
// separated by recessed seam gaps that show a dark core sphere beneath. Each panel's edges roll
// in slightly, so they catch the light like the soft bevels of a stylised game asset. The big
// camera eye, half the sphere across, sits in the front: a chunky dark bezel, then concentric
// glass rings stepping down into the sphere around a glowing pupil with a catch-light. A dark
// vent cap on top, two inset hatches on the upper sides and two cyan LED slots set into the lower
// front panels; every other panel stands a little proud of its neighbours. Built in eye-polar coordinates (`theta` from the nose,
// `psi` around it from the drone's left toward the top). Built once.

const R = SCOUT_BODY_RADIUS;
const SEAM = 0.075; // radians of gap between panels
const BEVEL = 0.0042; // how far a panel's edge rolls in
const BEVEL_WIDTH = 0.09; // radians over which it rolls
/** Where the eye's bezel ends and the front ring starts, in radians from the nose. */
export const SCOUT_EYE_THETA = 0.59;
/** Where the inner, tracking part of the eye pivots (on the nose axis). */
export const SCOUT_EYE_PIVOT_Z = 0.0745;

// Rows of a panel from `a` to `b`, refined near both edges so the bevel reads.
const rows = (a: number, b: number, step: number): number[] => {
  const inner: number[] = [];
  const span = b - a;
  const n = Math.max(1, Math.round(span / step));
  for (let i = 0; i <= n; i += 1) inner.push(a + (span * i) / n);
  const edges = [0.025, 0.06].flatMap((d) => (span > 2 * d + 0.02 ? [a + d, b - d] : []));
  return [...new Set([...inner, ...edges])].sort((p, q) => p - q);
};

/**
 * One panel: the patch of the sphere between `theta` and `psi` limits, its edges rolled in.
 * A `closed` panel wraps all the way around (`psi` 0..2pi) and only bevels along `theta`.
 */
const panel = (t0: number, t1: number, p0: number, p1: number, closed = false, raise = 0): BufferGeometry => {
  const ts = rows(t0, t1, 0.15);
  const ps = closed ? rows(0, Math.PI * 2, 0.17) : rows(p0, p1, 0.17);
  const positions: number[] = [];
  const index: number[] = [];
  const v = new Vector3();
  for (const t of ts) {
    for (const p of ps) {
      const edgeT = Math.min(t - t0, t1 - t);
      const edgeP = closed ? Infinity : Math.min(p - p0, p1 - p) * Math.sin(t);
      // The rear cap closes over the pole: no edge there.
      const edge = Math.min(t1 >= Math.PI - 1e-6 ? t - t0 : edgeT, edgeP);
      spherePoint(t, p, R + raise - BEVEL * (1 - smoothstep(0, BEVEL_WIDTH, edge)), v);
      positions.push(v.x, v.y, v.z);
    }
  }
  const cols = ps.length;
  for (let i = 0; i + 1 < ts.length; i += 1) {
    for (let j = 0; j + 1 < cols; j += 1) {
      const a = i * cols + j;
      index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const flat = g.toNonIndexed();
  g.dispose();
  return flat;
};

// Four panels around a band, `offset` turning the seams so the bands are staggered; `proud`
// lifts every other panel a little above its neighbours.
const PROUD = 0.0022;
const band = (t0: number, t1: number, offset: number, proud: 0 | 1): BufferGeometry[] => {
  const out: BufferGeometry[] = [];
  const quarter = Math.PI / 2;
  for (let k = 0; k < 4; k += 1) {
    const start = offset + k * quarter;
    out.push(panel(t0, t1, start + SEAM / 2, start + quarter - SEAM / 2, false, k % 2 === proud ? PROUD : 0));
  }
  return out;
};

/** Orients a small part on the sphere at (`theta`, `psi`): its +Z along the surface normal, +X along `psi`. */
const onSurface = (theta: number, psi: number, lift: number): { pos: Vector3; rot: Quaternion } => {
  const normal = spherePoint(theta, psi, 1);
  const along = new Vector3(-Math.sin(psi), Math.cos(psi), 0); // d/dpsi, unit
  const side = new Vector3().crossVectors(normal, along);
  const rot = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(along, side, normal));
  return { pos: spherePoint(theta, psi, R + lift), rot };
};

// Lathes a profile of (radius, z) points around the nose axis, offset back by `pivotZ`.
const latheAroundNose = (points: ReadonlyArray<readonly [number, number]>, pivotZ = 0): BufferGeometry => {
  const lathe = new LatheGeometry(points.map(([r, z]) => new Vector2(r, z - pivotZ)), 40);
  lathe.rotateX(Math.PI / 2); // the lathe's +Y axis onto +Z
  const part = placed(lathe, new Vector3());
  lathe.dispose();
  return part;
};

export type ScoutBodyGeometry = {
  /** The painted panels: occlusion baked into vertex colours (darker underneath). */
  readonly paint: BufferGeometry;
  /** Dark graphite: the core showing through the seams, the vent cap, the hatches and the eye's bezel and step. */
  readonly graphite: BufferGeometry;
  /** The two thin antennas on the top rear. */
  readonly antennas: BufferGeometry;
  /** The two cyan LED slots on the lower front sides. */
  readonly slots: BufferGeometry;
  /** The eye's fixed dark glass ring, just inside the bezel. */
  readonly eyeGlass: BufferGeometry;
  /** The eye's tracking part, about SCOUT_EYE_PIVOT_Z: a recessed step (graphite) and two glass rings. */
  readonly irisStep: BufferGeometry;
  readonly irisGlass: BufferGeometry;
  /** The glowing pupil and its small catch-light, about SCOUT_EYE_PIVOT_Z. */
  readonly pupil: BufferGeometry;
  readonly catchLight: BufferGeometry;
  /** Glossy black: the LED slots' surrounds and the vent cap's slot. */
  readonly insets: BufferGeometry;
};

export const buildScoutBody = (): ScoutBodyGeometry => {
  const front = SCOUT_EYE_THETA + 0.02;
  const ringEnd = 0.98;
  const equator = 1.64;
  const rearCap = 2.44;
  const panels = [
    ...band(front, ringEnd, Math.PI / 4, 0),
    ...band(ringEnd + SEAM, equator, 0, 1),
    ...band(equator + SEAM, rearCap, Math.PI / 4, 1),
    panel(rearCap + SEAM, Math.PI, 0, Math.PI * 2, true)
  ];
  const paint = bakeOcclusion(merge(panels), (_x, y) => 0.68 + 0.32 * smoothstep(-R, R * 0.4, y));

  // The core under the seams (open in front for the eye's recess), the vent cap on top, two
  // dark inset hatches on the upper sides, the eye's chunky bezel and its fixed recessed step.
  const core = new SphereGeometry(R - BEVEL - 0.0012, 18, 10, 0, Math.PI * 2, 0.55, Math.PI - 0.55);
  core.rotateX(Math.PI / 2); // its open pole onto the nose
  const ventCap = new BoxGeometry(0.036, 0.021, 0.007);
  const ventAt = onSurface(1.5, Math.PI / 2, 0.002);
  const hatch = new BoxGeometry(0.026, 0.017, 0.003);
  const hatches = [0.42, Math.PI - 0.42].map((psi) => {
    const at = onSurface(1.3, psi, 0.0006);
    return placed(hatch, at.pos, at.rot);
  });
  const bezel = latheAroundNose([
    [0.0474, 0.07],
    [0.047, 0.077],
    [0.0448, 0.0815],
    [0.0405, 0.0832],
    [0.0372, 0.0826],
    [0.0352, 0.08],
    [0.035, 0.078]
  ]);
  const step = latheAroundNose([
    [0.0287, 0.0781],
    [0.0282, 0.0758],
    [0.0236, 0.0755]
  ]);
  const graphite = merge([placed(core, new Vector3()), placed(ventCap, ventAt.pos, ventAt.rot), ...hatches, bezel, step], [core, ventCap, hatch]);

  // Two thin antennas on the top rear, one a little taller, each with a small tip bead.
  const tip = new SphereGeometry(0.0028, 8, 6);
  const antennaParts: BufferGeometry[] = [];
  for (const [x, height] of [[0.02, 0.07], [-0.024, 0.052]] as const) {
    const base = new Vector3(x, Math.sqrt(R * R - x * x - 0.045 * 0.045) - 0.002, -0.045);
    const top = base.clone().add(new Vector3(0, height, -0.006));
    antennaParts.push(rod(base, top, 0.0022, 0.0013, 6), placed(tip, top));
  }
  const antennas = merge(antennaParts, [tip]);

  // Cyan LED slots set into the lower front panels, each in a dark surround; and the vent slot.
  const slot = new BoxGeometry(0.016, 0.0065, 0.003);
  const surround = new BoxGeometry(0.021, 0.0115, 0.002);
  const slotParts: BufferGeometry[] = [];
  const surroundParts: BufferGeometry[] = [];
  for (const psi of [-0.95, -2.19]) {
    const at = onSurface(0.8, psi, 0.0006);
    slotParts.push(placed(slot, at.pos, at.rot));
    const back = onSurface(0.8, psi, 0.0001);
    surroundParts.push(placed(surround, back.pos, back.rot));
  }
  const ventSlot = new BoxGeometry(0.026, 0.006, 0.002);
  const ventSlotAt = onSurface(1.5, Math.PI / 2, 0.0057);
  const slots = merge(slotParts, [slot]);
  const insets = merge([...surroundParts, placed(ventSlot, ventSlotAt.pos, ventSlotAt.rot)], [surround, ventSlot]);

  // The eye, nose-axis lathes. Fixed: a dark glass ring inside the bezel. Tracking: an inner
  // glass ring, a second recessed step, the innermost glass ring, the pupil and its catch-light.
  const eyeGlass = latheAroundNose([
    [0.0352, 0.0779],
    [0.031, 0.0786],
    [0.0285, 0.0781]
  ]);
  const irisStep = latheAroundNose(
    [
      [0.0184, 0.0757],
      [0.018, 0.0738],
      [0.0142, 0.0736]
    ],
    SCOUT_EYE_PIVOT_Z
  );
  const irisGlass = merge([
    latheAroundNose(
      [
        [0.0238, 0.0755],
        [0.0205, 0.0761],
        [0.0182, 0.0757]
      ],
      SCOUT_EYE_PIVOT_Z
    ),
    latheAroundNose(
      [
        [0.0143, 0.0736],
        [0.0118, 0.0743],
        [0.0102, 0.074]
      ],
      SCOUT_EYE_PIVOT_Z
    )
  ]);
  const disc = new CircleGeometry(0.0104, 24);
  const pupil = placed(disc, new Vector3(0, 0, 0.0741 - SCOUT_EYE_PIVOT_Z));
  const spark = new CircleGeometry(0.0021, 10);
  const catchLight = placed(spark, new Vector3(-0.0042, 0.0042, 0.0749 - SCOUT_EYE_PIVOT_Z));
  disc.dispose();
  spark.dispose();
  return { paint, graphite, insets, antennas, slots, eyeGlass, irisStep, irisGlass, pupil, catchLight };
};
