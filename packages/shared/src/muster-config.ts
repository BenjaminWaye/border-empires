import { WORLD_HEIGHT, WORLD_WIDTH } from "./config.js";

// Maximum number of actions one ADVANCE/MARCH flag may have committed at
// once. A flag can launch another action as soon as the prior action starts
// its travel/claim/combat timer, while this cap prevents a single flag from
// flooding the lock table.
export const MUSTER_MAX_CONCURRENT_ACTIONS = 3;

// A fresh muster flag's default cap is the larger of MUSTER_FLAG_BASE_CAP_FLOOR
// and this fraction of the player's manpower cap. The floor keeps a flag
// useful at the start (150 is roughly 10% of a starting pool, enough for a
// Palisade) while the fraction lets the default grow with a big pool, and
// either way a single flag can't lock up the whole pool by default. Each
// "Expand Capacity" press adds another share of the *current* manpower cap,
// so upgrading stays meaningful late-game instead of being dwarfed by a fixed
// increment.
export const MUSTER_FLAG_CAP_MANPOWER_FRACTION = 0.1;
export const MUSTER_FLAG_BASE_CAP_FLOOR = 150;
// "Expand Capacity" is currently FREE (no manpower or resource cost) — see
// handleUpgradeMusterCapCommand (runtime-muster-cap-upgrade-command.ts).
// Deliberately temporary: the intended cost is a FOOD resource-slot
// occupation (the same supply/demand-slot mechanic Forts/Siege
// Outposts/Observatories use — resource-slot-view.ts), a real design task
// of its own that hasn't been done yet. No constant lives here for that
// cost until it's designed; don't reintroduce a flat manpower charge in
// its place.

/**
 * A muster flag's enforced cap: the larger of MUSTER_FLAG_BASE_CAP_FLOOR and
 * MUSTER_FLAG_CAP_MANPOWER_FRACTION of the player's manpower cap, plus that
 * same fraction again per "Expand Capacity" upgrade purchased (capLevel) —
 * but never more than the player's manpower cap itself. Without that final
 * clamp, enough upgrades would let a single flag demand more manpower than
 * the player's empire-wide pool can ever hold, which defeats the point of
 * capping flags in the first place. Recomputed live off the player's
 * *current* manpower cap wherever it's used (runtime-muster-tick.ts's
 * headroom calc, the tile-menu display), so it tracks growth/loss of that
 * cap automatically.
 */
export const musterFlagCap = (manpowerCap: number, capLevel: number | undefined): number => {
  const share = manpowerCap * MUSTER_FLAG_CAP_MANPOWER_FRACTION;
  const raw = Math.max(MUSTER_FLAG_BASE_CAP_FLOOR, share) + (capLevel ?? 0) * share;
  return Math.min(raw, manpowerCap);
};

// Longest MARCH a flag may be given, in tiles (toroidal Chebyshev distance
// from the flag to its target). Troops walking across the map take far longer
// than raising a muster flag next to the fight, and a long march also makes
// the route search expensive (it floods the map out to the flag), so a longer
// order is advice rather than a feature: raise a flag closer instead.
export const MUSTER_MARCH_MAX_DISTANCE_TILES = 15;

/** Toroidal Chebyshev distance in tiles between two points on the wrapping world. */
export const musterMarchDistanceTiles = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

/**
 * Advice shown instead of starting a march that is over the cap, or undefined
 * when the march is fine. Shared so the client (which checks first, and shows
 * it as plain advice) and the server (which enforces the cap and rejects with
 * this same text) never drift apart.
 */
export const musterMarchTooFarAdvice = (distanceTiles: number): string | undefined =>
  distanceTiles > MUSTER_MARCH_MAX_DISTANCE_TILES
    ? `That target is ${distanceTiles} tiles from this flag, and marches are limited to ${MUSTER_MARCH_MAX_DISTANCE_TILES} tiles. Raise a muster flag closer to the target instead: troops take much longer to walk across the map than it takes to muster next to the fight.`
    : undefined;

// How far (in steps through the flag owner's own and neutral land) an ADVANCE
// flag looks for hostile tiles to attack or approach. Shared so the player-facing
// text can quote the same number the simulation enforces.
export const MUSTER_ADVANCE_RANGE_STEPS = 10;
