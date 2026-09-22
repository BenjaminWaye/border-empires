// Ocean-shadow rule for RELAY_BEACON fog credit (relay-beacon-command-planner.ts).
//
// A fogged (never-delivered) tile inside a candidate's reach box is credited as
// "possibly unexplored land" — but if the straight line from the candidate to
// it crosses two consecutive known-water tiles, we've hit open ocean and the
// fog behind it is (near-)certainly more ocean, not a reason to keep chaining
// beacons along a beach. Shadowed fog then counts as water itself, so the rule
// propagates outward through fog behind the first two visible water tiles.
//
// Deliberately terrain-only and allocation-free: the planner's tile view has no
// biome/beach field (adding one would grow the per-tile worker sync payload),
// and the worker must not run worldgen (its terrainAt is a ~6.6s whole-world
// mask build under a real seed). Everything here is table lookups over the
// (2R+1)^2 box the caller already scans — no extra tilesByKey reads.
import { OUTPOST_REACH_RADIUS } from "@border-empires/shared";

export const FOG_BOX_SIDE = OUTPOST_REACH_RADIUS * 2 + 1;
export const FOG_BOX_CELLS = FOG_BOX_SIDE * FOG_BOX_SIDE;

// Per-cell scan state. Only WATER and SHADOW count as "water-like" for the rule.
export const CELL_OTHER = 0; // in reach, or known non-water (land/mountain/owned)
export const CELL_FOG = 1; // never delivered to this player
export const CELL_WATER = 2; // known SEA / COASTAL_SEA
export const CELL_SHADOW = 3; // fog assumed to be ocean by this rule

const UNSET = -1;

export const boxCellIndex = (dx: number, dy: number): number =>
  (dy + OUTPOST_REACH_RADIUS) * FOG_BOX_SIDE + (dx + OUTPOST_REACH_RADIUS);

const chebyshevOfIndex = (idx: number): number =>
  Math.max(
    Math.abs((idx % FOG_BOX_SIDE) - OUTPOST_REACH_RADIUS),
    Math.abs(Math.floor(idx / FOG_BOX_SIDE) - OUTPOST_REACH_RADIUS)
  );

// For each cell: the two cells one and two steps back toward the box centre
// (the candidate) along the rounded straight line. UNSET when the cell is too
// close to the centre for two steps to exist without landing on it.
const inner1 = new Int16Array(FOG_BOX_CELLS).fill(UNSET);
const inner2 = new Int16Array(FOG_BOX_CELLS).fill(UNSET);
const shadowCandidates: number[] = [];

for (let dy = -OUTPOST_REACH_RADIUS; dy <= OUTPOST_REACH_RADIUS; dy += 1) {
  for (let dx = -OUTPOST_REACH_RADIUS; dx <= OUTPOST_REACH_RADIUS; dx += 1) {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d < 3) continue;
    const idx = boxCellIndex(dx, dy);
    inner1[idx] = boxCellIndex(Math.round((dx * (d - 1)) / d), Math.round((dy * (d - 1)) / d));
    inner2[idx] = boxCellIndex(Math.round((dx * (d - 2)) / d), Math.round((dy * (d - 2)) / d));
    shadowCandidates.push(idx);
  }
}
// Nearest-first, so a shadowed cell is already marked before the cells behind it are judged.
shadowCandidates.sort((a, b) => chebyshevOfIndex(a) - chebyshevOfIndex(b));

const waterLike = (state: number | undefined): boolean => state === CELL_WATER || state === CELL_SHADOW;

/** Marks fog cells hidden behind >= 2 consecutive water cells as CELL_SHADOW, in place. */
export const markOceanShadowedFog = (state: Uint8Array): void => {
  for (const idx of shadowCandidates) {
    if (state[idx] !== CELL_FOG) continue;
    if (waterLike(state[inner1[idx] as number]) && waterLike(state[inner2[idx] as number])) {
      state[idx] = CELL_SHADOW;
    }
  }
};
