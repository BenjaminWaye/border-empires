// The soft shoreline's shape (client-map-3d-shore-sand.ts draws the beach
// fringe inside it; client-map-3d-shore.ts's foam fades out from it).
//
// The waterline is where a smoothly blurred map of which tiles are land
// (a quadratic B-spline over tile centres) crosses SHORE_FIELD_THRESHOLD,
// sampled at a position warped by world noise at two scales. Blurring
// straightens a staircase coast into a diagonal shore, fills notches and
// keeps points gently rounded, and the warp adds irregularity that isn't
// keyed to the tile grid. (An earlier offset-curve shape -- an arc round
// every convex corner, a fillet in every notch -- turned a stepped coast
// into a regular row of scallops.) Two clamps: sand never reaches past
// SHORE_SAND_MAX_REACH from real land, nor more than halfway (less
// SHORE_SAND_OPEN_HALF_WIDTH) across water with land on the far side, so a
// one-tile inlet or strait never silts up; and a SHORE_SAND_MIN_BAND of
// sand always rings land, so a land tip never shows its square corner.
// Both clamps are eased in rather than cut, so neither leaves a corner.
// The reach pinches to nothing at river mouths so the fringe never dams a
// river. Everything is a function of world position, so adjacent sea tiles
// meet seamlessly; the shore foam reads the same waterline.
import { foamMouthFade } from "./client-map-3d-shore.js";

// Blurred land field (1 deep inland, 0.5 on a straight coast's tile edge)
// threshold: 0.18 puts a straight coast's waterline ~0.45 tiles out, and a
// diagonal (staircase) coast's ~0.11 outside the land tiles' outer corners.
// At 0.22 the diagonal waterline ran right past those corners, and their
// fade-out met the square territory edge as a row of teeth.
const SHORE_FIELD_THRESHOLD = 0.18;
// d(field)/d(distance) near that waterline, to read the field as tiles.
const SHORE_FIELD_SLOPE = 0.66;
// On a diagonal coast the waterline runs close to the land's outer corners,
// so an inward warp dragged it inside them and left each corner jutting
// into the sea as a tooth. The warp may pull the shore at most this far
// (tiles) inside where the unwarped field puts it -- not at all; it still
// pushes headlands outward freely.
const SHORE_WARP_MAX_INWARD = 0;
/** Furthest (tiles) the beach ever reaches into the sea from real land. */
// Well past half a tile on purpose: a diagonal coast's waterline runs
// through the corner sea tiles' centres, ~0.53 from land. A 0.48 cap, meant
// to keep every sea tile's centre open, dented the beach between steps --
// the other half of the teeth. Inlets and straits are kept open by the
// across-water cap instead (SHORE_SAND_OPEN_HALF_WIDTH).
export const SHORE_SAND_MAX_REACH = 0.9;
// Half the open water kept down the middle of water with land on both
// sides (a one-tile inlet keeps ~0.37 of a tile).
const SHORE_SAND_OPEN_HALF_WIDTH = 0.15;
// Sand always rings land at least this deep. Kept thin: with the warp
// held back it rarely binds, and a wider band (0.12) itself pushed the
// beach out round every outer corner of a diagonal coast into teeth.
const SHORE_SAND_MIN_BAND = 0.05;
// On a steep stepped coast (one tile across per few down) the blurred
// curve fills the notch under each step past the reach cap; a hard cap cut
// that fill off square, a shelf with a sharp corner at every step. A smooth
// minimum rounds it; it only ever sits at or below both terms, so the
// reach bound still holds.
const SHORE_SAND_REACH_BLEND = 0.15;
// Likewise the band and the warp limit are eased in where they take over
// from the curve, so neither leaves a crease.
const SHORE_SAND_BAND_BLEND = 0.05;
// Domain warp of the field sample: broad bays/headlands plus fine wiggle.
const SHORE_WARP_BROAD = 0.22;
const SHORE_WARP_BROAD_SCALE = 0.9;
const SHORE_WARP_FINE = 0.07;
const SHORE_WARP_FINE_SCALE = 2.6;

const hash = (x: number, z: number): number => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const valueNoise = (x: number, z: number): number => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};

const bspline = (t: number): number => {
  const a = Math.abs(t);
  if (a < 0.5) return 0.75 - a * a;
  if (a < 1.5) return 0.5 * (1.5 - a) * (1.5 - a);
  return 0;
};

// Up to 9 land squares round a point: offsets to their closest points, and
// whether that point lies on a side of the square (1) or on a corner (0).
const nearDx = new Float64Array(9);
const nearDz = new Float64Array(9);
const nearSide = new Uint8Array(9);

/**
 * Distance to the nearest land square (`d`, Infinity if none within a tile)
 * and how far from land the sand may reach here (`cap`): SHORE_SAND_MAX_REACH,
 * or less where other land lies on the far side of the water -- then the
 * sand stops SHORE_SAND_OPEN_HALF_WIDTH short of halfway across. "Far side"
 * is weighed by direction (eased from ~100 to ~135 degrees apart) so the cap
 * changes smoothly, and only between land the point faces side-on: land
 * round a corner (a staircase notch, where the land further down the coast
 * lies the other way but only past a corner) doesn't count.
 */
const landReachNear = (x: number, z: number, isLandTile: (gc: number, gr: number) => boolean): { d: number; cap: number } => {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let count = 0;
  let best = Infinity;
  let bestK = -1;
  for (let j = cz - 1; j <= cz + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      if (!isLandTile(i, j)) continue;
      const dx = Math.min(Math.max(x, i), i + 1) - x;
      const dz = Math.min(Math.max(z, j), j + 1) - z;
      nearDx[count] = dx;
      nearDz[count] = dz;
      nearSide[count] = (x >= i && x <= i + 1) || (z >= j && z <= j + 1) ? 1 : 0;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) {
        best = d;
        bestK = count;
      }
      count += 1;
    }
  }
  if (bestK < 0 || best === 0 || nearSide[bestK] === 0) return { d: best, cap: SHORE_SAND_MAX_REACH };
  const ax = nearDx[bestK]! / best;
  const az = nearDz[bestK]! / best;
  let cap = SHORE_SAND_MAX_REACH;
  for (let k = 0; k < count; k++) {
    if (k === bestK || nearSide[k] === 0) continue;
    const len = Math.sqrt(nearDx[k]! * nearDx[k]! + nearDz[k]! * nearDz[k]!);
    if (len === 0) continue;
    const cos = (ax * nearDx[k]! + az * nearDz[k]!) / len;
    const t = Math.min(1, Math.max(0, (-0.2 - cos) / 0.5));
    const opposite = t * t * (3 - 2 * t);
    if (opposite === 0) continue;
    const across = (best + len) / 2 - SHORE_SAND_OPEN_HALF_WIDTH;
    cap = Math.min(cap, SHORE_SAND_MAX_REACH + (across - SHORE_SAND_MAX_REACH) * opposite);
  }
  return { d: best, cap };
};

// Which tiles are land, blurred by a quadratic B-spline over tile centres.
const landField = (px: number, pz: number, isLandTile: (gc: number, gr: number) => boolean): number => {
  let field = 0;
  for (let j = Math.floor(pz - 1.5); j <= Math.floor(pz + 1.5); j++) {
    const wzj = bspline(pz - (j + 0.5));
    if (wzj === 0) continue;
    for (let i = Math.floor(px - 1.5); i <= Math.floor(px + 1.5); i++) {
      if (isLandTile(i, j)) field += bspline(px - (i + 0.5)) * wzj;
    }
  }
  return field;
};

/** Signed shoreline at scene point (x, z), in tiles: > 0 inside the sand, < 0 out over the water. */
export type ShoreWaterline = (x: number, z: number) => number;

/**
 * The soft waterline for one water commit (scene grid coords). The sand
 * fringe draws where it is > 0 and the shore foam fades out from its zero
 * line, so the two always agree.
 */
export const createShoreWaterline = (
  isLandTile: (gc: number, gr: number) => boolean,
  worldOffsetX: number,
  worldOffsetZ: number,
  mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>
): ShoreWaterline => (x, z) => {
  const wx = x + worldOffsetX;
  const wz = z + worldOffsetZ;
  const b = SHORE_WARP_BROAD_SCALE;
  const f = SHORE_WARP_FINE_SCALE;
  const px =
    x + (valueNoise(wx * b, wz * b) - 0.5) * 2 * SHORE_WARP_BROAD + (valueNoise(wx * f + 17, wz * f + 3) - 0.5) * 2 * SHORE_WARP_FINE;
  const pz =
    z + (valueNoise(wx * b + 31, wz * b + 7) - 0.5) * 2 * SHORE_WARP_BROAD + (valueNoise(wx * f + 5, wz * f + 29) - 0.5) * 2 * SHORE_WARP_FINE;
  const { d, cap } = landReachNear(x, z, isLandTile);
  // No land within a tile: open water (and keeps Infinity out of the maths
  // below -- 0 * Infinity there came out NaN, which drew foam as solid bars).
  if (d === Infinity) return -1;
  const curveAt = (fx: number, fz: number): number => (landField(fx, fz, isLandTile) - SHORE_FIELD_THRESHOLD) / SHORE_FIELD_SLOPE;
  // Smooth max, so where the limit takes over it leaves no crease.
  const warped = curveAt(px, pz);
  const held = curveAt(x, z) - SHORE_WARP_MAX_INWARD;
  const curve = (warped + held + Math.hypot(warped - held, SHORE_SAND_BAND_BLEND)) / 2;
  const reach = cap - d;
  const band = SHORE_SAND_MIN_BAND - d;
  // Smooth max with the band, then smooth min with the reach cap: the
  // smooth min sits at or below its terms, so the reach bound still holds.
  const banded = (curve + band + Math.hypot(curve - band, SHORE_SAND_BAND_BLEND)) / 2;
  const shaped = (banded + reach - Math.hypot(banded - reach, SHORE_SAND_REACH_BLEND)) / 2;
  if (mouths.length === 0) return shaped;
  // Squared: the foam's own fade still left a sand lip across the river
  // just off the mouth; this pinches the strip to nothing there.
  const fade = foamMouthFade(x, z, mouths) ** 2;
  return shaped * fade - (1 - fade) * d;
};
