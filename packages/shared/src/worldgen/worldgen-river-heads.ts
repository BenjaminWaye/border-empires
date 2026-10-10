// Where each v9+ edge river begins: the corner its path starts on, the
// direction it sets off in, and -- when it starts right next to one -- the
// mountain it can be drawn flowing out of (docs/river-mountains-plan.md).
// Read-only over the existing river paths; changes no worldgen output.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { terrainAt } from "./worldgen.js";
import { edgeRiversActive, riversForCurrentSeed, type RiverPath } from "./worldgen-rivers.js";

export type RiverHead = {
  /** The corner the river starts on (world corner coords). */
  readonly corner: { readonly x: number; readonly y: number };
  /** Unit step of the river's first edge. */
  readonly heading: { readonly dx: number; readonly dy: number };
  /**
   * A mountain tile in the ring just outside the head corner (touching one of
   * its four neighbouring corners), from static worldgen terrain; null when
   * there is none. The client re-checks live terrain before drawing it.
   */
  readonly mountain: { readonly x: number; readonly y: number } | null;
};

// Tiles touching one of corner C's four neighbouring corners but not C itself
// (offsets from C; tile (x, y) spans corners x..x+1, y..y+1).
const HEADWATER_RING: ReadonlyArray<readonly [number, number]> = [
  [-1, -2], [0, -2],
  [1, -1], [1, 0],
  [-1, 1], [0, 1],
  [-2, -1], [-2, 0]
];

const signedStep = (from: number, to: number, size: number): number => {
  let d = to - from;
  if (d > size / 2) d -= size;
  if (d < -size / 2) d += size;
  return Math.sign(d);
};

/**
 * The mountain a river starting at (cx, cy) heading (dx, dy) flows out of:
 * the ring tile furthest behind the river's heading (ties: ring order).
 */
export const headwaterMountainAt = (
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  isMountainAt: (x: number, y: number) => boolean = (x, y) => terrainAt(x, y) === "MOUNTAIN"
): { readonly x: number; readonly y: number } | null => {
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const [ox, oy] of HEADWATER_RING) {
    const x = wrapX(cx + ox, WORLD_WIDTH);
    const y = wrapY(cy + oy, WORLD_HEIGHT);
    if (!isMountainAt(x, y)) continue;
    // Tile centre relative to the corner, projected on the heading.
    const score = (ox + 0.5) * dx + (oy + 0.5) * dy;
    if (score < bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
};

export const riverHeadsOf = (rivers: readonly RiverPath[]): ReadonlyMap<number, RiverHead> => {
  const heads = new Map<number, RiverHead>();
  for (const path of rivers) {
    const first = path[0];
    const second = path[1];
    if (!first || !second) continue;
    const x = wrapX(Math.round(first.wx), WORLD_WIDTH);
    const y = wrapY(Math.round(first.wy), WORLD_HEIGHT);
    const dx = signedStep(x, wrapX(Math.round(second.wx), WORLD_WIDTH), WORLD_WIDTH);
    const dy = signedStep(y, wrapY(Math.round(second.wy), WORLD_HEIGHT), WORLD_HEIGHT);
    heads.set(y * WORLD_WIDTH + x, { corner: { x, y }, heading: { dx, dy }, mountain: headwaterMountainAt(x, y, dx, dy) });
  }
  return heads;
};

const EMPTY: ReadonlyMap<number, RiverHead> = new Map();
// One seed's worth (one entry per river), recomputed when the memoized river
// list changes identity (seed or worldgen version change).
let cachedFor: readonly RiverPath[] | undefined;
let cachedHeads: ReadonlyMap<number, RiverHead> = EMPTY;

/** v9+: river head corner index (y * WORLD_WIDTH + x) -> head. Empty for v1-v8 (tile-centre rivers). */
export const riverHeadsForCurrentSeed = (): ReadonlyMap<number, RiverHead> => {
  if (!edgeRiversActive()) return EMPTY;
  const rivers = riversForCurrentSeed();
  if (rivers !== cachedFor) {
    cachedFor = rivers;
    cachedHeads = riverHeadsOf(rivers);
  }
  return cachedHeads;
};
