// Where each v9+ edge river begins: the corner its path starts on, the
// direction it sets off in, and -- when it starts right next to one -- the
// mountain it can be drawn flowing out of (docs/river-mountains-plan.md).
// Read-only over the existing river paths; changes no worldgen output.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";
import { edgeRiversActive, riversForCurrentSeed, type RiverPath } from "./worldgen-rivers.js";
import { headwaterMountainAt, signedStep } from "./worldgen-river-headwater.js";

export { headwaterMountainAt };

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
