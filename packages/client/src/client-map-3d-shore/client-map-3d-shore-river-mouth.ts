// Where a river crosses the beach fringe (client-map-3d-shore-sand.ts).
//
// The fringe used to pinch to nothing in a circle round each mouth corner.
// Its sand still reached in close to the corner, so the waterline closed
// into a V that met the river in a point: the river squeezed through a
// neck at the coast and burst out into a funnel beyond it. Instead the
// fringe is cut along a channel as wide as the river, running out from the
// mouth corner toward the sea and opening a little as it goes, so the river
// carries on across the beach at its own width, between rounded sand banks.

import { ESTUARY_FLARE } from "../client-map-3d-rivers/client-map-3d-river-edge-water.js";
import { BANK_WIDTH, MAX_CHANNEL_HALF_WIDTH, riverTrenchDepth } from "../client-map-3d-rivers/client-map-3d-rivers-channel.js";

/** A river mouth corner (scene coords) and the unit direction out to sea from it. */
export type ShoreRiverMouth = { readonly x: number; readonly z: number; readonly dx: number; readonly dz: number };

// The cut reaches out to where the land's own river bank meets dry ground
// at the coast (the channel's half-width plus BANK_WIDTH), so the beach's
// edge carries the land bank's edge straight on; the river's water widens
// under both near the coast (appendWater), and the beach beside the cut is
// coloured like the bank (riverMouthBankDepth). Narrower, and the beach
// stuck into the river as a sand tooth; wider, and the bank stopped dead
// at the coast edge against a strip of open sea.
// Over this distance (tiles) out from the coast the carried-on bank fades
// back to plain beach, so the mud ends in the bank's rounded seaward end.
const MOUTH_BANK_FADE = 0.7;
/** The river channel's half-width at the coast: the widest channel, flared into its estuary (withMouthDescent). */
const coastChannelHalfWidth = (): number => MAX_CHANNEL_HALF_WIDTH * (1 + ESTUARY_FLARE);
// Read on use, not at load: this module sits on an import cycle through the
// water surface, so the river modules may not have run yet when it loads.
const mouthCutHalfWidth = (): number => coastChannelHalfWidth() + BANK_WIDTH;

// Extra half-width per tile out to sea: the banks part a little, like a
// real river mouth, rather than running out in dead parallel lines.
const MOUTH_CUT_SPREAD = 0.15;
// The cut starts this far behind the corner (inland), so it reaches the
// land's own coast edge squarely.
const MOUTH_CUT_BACK = 0.05;
// How far (tiles) the cut runs out from the corner: past the fringe's
// furthest reach (SHORE_SAND_MAX_REACH 0.9 from land), even across a
// diagonal mouth's sea tile, but no further -- an endless cut sliced
// through the beach on the far side of a narrow inlet.
const MOUTH_CUT_LENGTH = 1.2;
// Past this distance (tiles) from a mouth the cut distance is at least
// ~1.3 (the channel's far corner is ~1.3 from the mouth), more than the
// waterline ever reaches (0.9) plus the waterline's bank blend (0.2), so
// skipping it there changes nothing: no step at the edge of the range.
const MOUTH_CUT_RANGE = 2.6;
/** Signed distance reported where no mouth is in range: far outside any cut. */
export const NO_MOUTH_CUT = 10;

/**
 * Mouths with their seaward direction: from each corner toward the centres
 * of the sea tiles (not land, per `isLandTile`) among the four touching it.
 * A mouth whose corner touches no sea is dropped.
 */
export const withSeaDirections = (
  mouths: ReadonlyArray<{ readonly x: number; readonly z: number }>,
  isLandTile: (gc: number, gr: number) => boolean
): ShoreRiverMouth[] => {
  const out: ShoreRiverMouth[] = [];
  for (const m of mouths) {
    let dx = 0;
    let dz = 0;
    for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      if (isLandTile(m.x + ox, m.z + oz)) continue;
      dx += ox + 0.5;
      dz += oz + 0.5;
    }
    const len = Math.hypot(dx, dz);
    if (len > 0) out.push({ x: m.x, z: m.z, dx: dx / len, dz: dz / len });
  }
  return out;
};

/**
 * Signed distance (tiles) from (x, z) to the nearest river's cut through
 * the fringe: < 0 inside it (open water), > 0 outside, where beach may
 * stand. Read as a distance, the shoreline takes the smooth minimum of it
 * and its own waterline (client-map-3d-shore-waterline.ts), so each bank
 * runs alongside the river and rounds off at its seaward end. (Scaling the
 * sand down near the mouth instead slanted every bank into a wedge.)
 */
export const riverMouthCutDistance = (x: number, z: number, mouths: ReadonlyArray<ShoreRiverMouth>): number => {
  let best = NO_MOUTH_CUT;
  for (const m of mouths) {
    const rx = x - m.x;
    const rz = z - m.z;
    if (rx * rx + rz * rz > MOUTH_CUT_RANGE * MOUTH_CUT_RANGE) continue;
    const along = rx * m.dx + rz * m.dz;
    const across = Math.abs(rx * m.dz - rz * m.dx);
    const beside = across - (mouthCutHalfWidth() + Math.max(0, along) * MOUTH_CUT_SPREAD);
    // Outside the channel if beside it, behind its start (inland) or past its end.
    best = Math.min(best, Math.max(beside, -along - MOUTH_CUT_BACK, along - MOUTH_CUT_LENGTH));
  }
  return best;
};

/**
 * How deep (tiles, as riverTrenchDepth) the river's bank would be at (x, z)
 * on the beach round a mouth: the land's bank profile across the river,
 * carried out to sea and faded to nothing by MOUTH_BANK_FADE. The beach
 * there is coloured like that bank (riverBankColor), so the bank runs on
 * from the land with no break at the coast edge. 0 away from any mouth.
 */
export const riverMouthBankDepth = (x: number, z: number, mouths: ReadonlyArray<ShoreRiverMouth>): number => {
  let depth = 0;
  for (const m of mouths) {
    const rx = x - m.x;
    const rz = z - m.z;
    const along = rx * m.dx + rz * m.dz;
    if (along < -MOUTH_CUT_BACK || along > MOUTH_BANK_FADE) continue;
    const across = Math.abs(rx * m.dz - rz * m.dx) - Math.max(0, along) * MOUTH_CUT_SPREAD;
    const fade = 1 - Math.max(0, along) / MOUTH_BANK_FADE;
    depth = Math.max(depth, riverTrenchDepth(across, coastChannelHalfWidth()) * fade * fade);
  }
  return depth;
};
