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
// outward-only it rarely binds, and a wider band (0.12) itself pushed the
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

// Up to 9 land squares round a point: offsets to their closest points,
// distances, and how squarely the point faces each one (1 = beside a side,
// fading to 0 past its corner, see SHORE_SIDE_FADE).
const nearDx = new Float64Array(9);
const nearDz = new Float64Array(9);
const nearD = new Float64Array(9);
const nearSide = new Float64Array(9);
const nearI = new Int32Array(9);
const nearJ = new Int32Array(9);
// How far (tiles) past a land square's corner, beyond the line of its side,
// it stops counting as land the point faces across water. Gradual, so the
// across-water limit never jumps; without it, land round a corner (the next
// step of a staircase coast) read as the far bank and creased the beach.
const SHORE_SIDE_FADE = 0.25;
// How clear of other land (tiles) the midpoint between two banks must be
// for them to count fully (eased in from 0).
const SHORE_BANK_CLEARANCE = 0.3;

const distanceToSquare = (x: number, z: number, i: number, j: number): number => {
  const dx = Math.min(Math.max(x, i), i + 1) - x;
  const dz = Math.min(Math.max(z, j), j + 1) - z;
  return Math.sqrt(dx * dx + dz * dz);
};

const smooth01 = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

// Set by landReach: distance to the nearest land square (Infinity if none
// within a tile). A module slot rather than a returned object -- this runs
// for every fringe sample on every terrain rebuild.
let nearestLand = Infinity;

/**
 * How far into the sand the waterline may sit at (x, z): at most
 * SHORE_SAND_MAX_REACH from the nearest land, and, between two banks facing
 * each other across water, no closer to the middle than
 * SHORE_SAND_OPEN_HALF_WIDTH (so inlets, straits and lakes keep open water).
 * Every pair of land squares is weighed symmetrically -- by how far apart
 * their directions are (eased in from ~100 to ~135 degrees) and how squarely
 * the point faces each -- so the limit changes continuously. Two squares
 * are only banks if the point halfway between their nearest points is clear
 * of other land (SHORE_BANK_CLEARANCE): halfway across a lake is open water,
 * while two tiles of one coast (either side of the tile beside the point,
 * or a step apart round a corner) have land right at that midpoint and
 * otherwise thinned or cut the beach. Squares that touch never count. Pairs
 * fade out before either square could leave the 3x3 block this samples
 * (anything nearer than a tile is always in it), so crossing a tile
 * boundary never makes the limit jump.
 */
const landReach = (x: number, z: number, isLandTile: (gc: number, gr: number) => boolean): number => {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let count = 0;
  let best = Infinity;
  for (let j = cz - 1; j <= cz + 1; j++) {
    for (let i = cx - 1; i <= cx + 1; i++) {
      if (!isLandTile(i, j)) continue;
      const dx = Math.min(Math.max(x, i), i + 1) - x;
      const dz = Math.min(Math.max(z, j), j + 1) - z;
      const d = Math.sqrt(dx * dx + dz * dz);
      nearDx[count] = dx;
      nearDz[count] = dz;
      nearD[count] = d;
      nearI[count] = i;
      nearJ[count] = j;
      const past = Math.min(Math.max(0, i - x, x - i - 1), Math.max(0, j - z, z - j - 1));
      nearSide[count] = 1 - smooth01(past / SHORE_SIDE_FADE);
      if (d < best) best = d;
      count += 1;
    }
  }
  nearestLand = best;
  let reach = SHORE_SAND_MAX_REACH - best;
  for (let a = 0; a < count; a++) {
    const da = nearD[a]!;
    if (da === 0 || nearSide[a] === 0) continue;
    for (let b = a + 1; b < count; b++) {
      const db = nearD[b]!;
      if (db === 0 || nearSide[b] === 0) continue;
      if (Math.abs(nearI[b]! - nearI[a]!) <= 1 && Math.abs(nearJ[b]! - nearJ[a]!) <= 1) continue;
      const cos = (nearDx[a]! * nearDx[b]! + nearDz[a]! * nearDz[b]!) / (da * db);
      let weight = smooth01((-0.2 - cos) / 0.5) * nearSide[a]! * nearSide[b]! * (1 - smooth01((Math.max(da, db) - 0.75) / 0.25));
      if (weight === 0) continue;
      const mx = x + (nearDx[a]! + nearDx[b]!) / 2;
      const mz = z + (nearDz[a]! + nearDz[b]!) / 2;
      let clear = Infinity;
      for (let c = 0; c < count; c++) {
        if (c === a || c === b) continue;
        clear = Math.min(clear, distanceToSquare(mx, mz, nearI[c]!, nearJ[c]!));
      }
      weight *= smooth01(clear / SHORE_BANK_CLEARANCE);
      if (weight === 0) continue;
      const between = Math.abs(da - db) / 2 - SHORE_SAND_OPEN_HALF_WIDTH;
      reach = Math.min(reach, reach + (between - reach) * weight);
    }
  }
  return reach;
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
  const reach = landReach(x, z, isLandTile);
  const d = nearestLand;
  // A tile or more from land: open water (eased to this below, so no step),
  // and most of what follows is the costly part -- skip it.
  if (d >= 1) return -1;
  const wx = x + worldOffsetX;
  const wz = z + worldOffsetZ;
  const b = SHORE_WARP_BROAD_SCALE;
  const f = SHORE_WARP_FINE_SCALE;
  const px =
    x + (valueNoise(wx * b, wz * b) - 0.5) * 2 * SHORE_WARP_BROAD + (valueNoise(wx * f + 17, wz * f + 3) - 0.5) * 2 * SHORE_WARP_FINE;
  const pz =
    z + (valueNoise(wx * b + 31, wz * b + 7) - 0.5) * 2 * SHORE_WARP_BROAD + (valueNoise(wx * f + 5, wz * f + 29) - 0.5) * 2 * SHORE_WARP_FINE;
  const curveAt = (fx: number, fz: number): number => (landField(fx, fz, isLandTile) - SHORE_FIELD_THRESHOLD) / SHORE_FIELD_SLOPE;
  // The warp only ever pushes the shore outward: on a diagonal coast the
  // waterline runs close to the land's outer corners, and an inward warp
  // dragged it inside them, leaving each corner jutting into the sea as a
  // tooth. Smooth max, so where the unwarped shore takes over there's no crease.
  const warped = curveAt(px, pz);
  const held = curveAt(x, z);
  const curve = (warped + held + Math.hypot(warped - held, SHORE_SAND_BAND_BLEND)) / 2;
  const band = SHORE_SAND_MIN_BAND - d;
  // Smooth max with the band, then smooth min with the reach cap: the
  // smooth min sits at or below its terms, so the reach bound still holds.
  const banded = (curve + band + Math.hypot(curve - band, SHORE_SAND_BAND_BLEND)) / 2;
  const capped = (banded + reach - Math.hypot(banded - reach, SHORE_SAND_REACH_BLEND)) / 2;
  // Eased to the same open-water -1 as "no land within a tile" (above) by the
  // time the nearest land is a tile off, so crossing into a tile with no land
  // round it doesn't step the foam's fade.
  const shaped = capped + (-1 - capped) * smooth01((d - 0.75) / 0.25);
  if (mouths.length === 0) return shaped;
  // Squared: the foam's own fade still left a sand lip across the river
  // just off the mouth; this pinches the strip to nothing there.
  const fade = foamMouthFade(x, z, mouths) ** 2;
  return shaped * fade - (1 - fade) * d;
};
