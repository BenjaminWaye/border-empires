// Shared, wrap-aware, tier-aware support-ring scan -- the single place that
// actually walks a town's support ring, split out from town-growth.ts (which
// only carries supportRingRadiusForTier/MAX_SUPPORT_RING_RADIUS, the raw
// tier->radius facts).
//
// Consolidation note (2026-09-10): before this file existed, every consumer
// of supportRingRadiusForTier hand-rolled its own `for (dy...) for (dx...)`
// scan instead of calling a shared one -- the doc comment on
// MAX_SUPPORT_RING_RADIUS said "callers should bound their dx/dy loops by
// it," but nothing enforced that beyond prose. Six of the ~12 call sites
// across the simulation, the client, and the gateway got at least one of two
// things wrong: the loop bound (hardcoded 1 instead of the real radius) or
// world-wrap (raw `x + dx` instead of wrapX/wrapY) -- three independent
// copies of the same bug, silently capping a GREAT_CITY/METROPOLIS town's
// second ring to zero effect in gold income, combat-bonus counts, and
// buildable tiles, all at once, more than once. supportRingCandidates is the
// fix: it is the only support-ring scan in the codebase now, so getting the
// radius or the wrap wrong here fixes (or breaks) every caller at once,
// rather than needing six independent fixes for six independent bugs.
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { wrapX, wrapY } from "../math/math.js";

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

export type SupportRingCandidate<T> = { tile: T; dx: number; dy: number };

/**
 * Every tile within `radius` (Chebyshev, wrap-aware) of (x, y), excluding
 * (x, y) itself. Callers with a specific town in hand should pass
 * supportRingRadiusForTier(town.populationTier) as `radius` directly.
 * Callers scanning FROM a support tile OUTWARD (looking for which town it
 * belongs to, where the town's own tier isn't known yet) should pass
 * MAX_SUPPORT_RING_RADIUS and filter each returned candidate by ITS OWN
 * tier's radius (`Math.max(Math.abs(dx), Math.abs(dy)) <=
 * supportRingRadiusForTier(candidate's tier)`) -- see
 * playerHasWideSupportRingTown (town-growth.ts) for cheaply avoiding that
 * wider scan entirely when the player owns no wide-ring town.
 */
export const supportRingCandidates = <T>(
  tiles: ReadonlyMap<string, T>,
  x: number,
  y: number,
  radius: number
): Array<SupportRingCandidate<T>> => {
  const result: Array<SupportRingCandidate<T>> = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tiles.get(tileKeyOf(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)));
      if (tile) result.push({ tile, dx, dy });
    }
  }
  return result;
};
