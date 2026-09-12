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
import { chebyshevWithWrap } from "../reach/reach-geometry.js";
import { MAX_SUPPORT_RING_RADIUS } from "./town-growth.js";

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

export type SupportRingCandidate<T> = { tile: T; dx: number; dy: number };

/**
 * Every tile within `radius` (Chebyshev, wrap-aware) of (x, y), excluding
 * (x, y) itself. Callers with a specific town in hand should pass
 * supportRingRadiusForTier(town.populationTier) as `radius` directly.
 * Callers scanning FROM a support tile OUTWARD (looking for which town it
 * belongs to, where the town's own tier isn't known yet) should pass
 * wideSupportRingScanRadiusFor's result (below) instead of a flat
 * MAX_SUPPORT_RING_RADIUS, then still filter each returned candidate by ITS
 * OWN tier's radius (`Math.max(Math.abs(dx), Math.abs(dy)) <=
 * supportRingRadiusForTier(candidate's tier)`).
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

// Memoized per tiles-snapshot (WeakMap key), same lifetime/cost shape as the
// old playerHasWideSupportRingTown this replaces: a single economy recompute
// calls this many times per player (once per "scan outward from a support
// tile" check), and building the position list is an O(world) tile scan.
// WeakMap keying means this is auto-GC'd the moment a fresh snapshot map
// replaces the old one -- no explicit eviction needed, satisfying the
// bound-every-growable-map rule without a manual cleanup path. Bounded by
// player count either way (not by load/game time), same as the cache it
// replaces.
const wideSupportRingTownPositionsCache = new WeakMap<object, Map<string, Array<{ x: number; y: number }>>>();

/**
 * Cost-scoped replacement for the old playerHasWideSupportRingTown gate
 * (town-growth.ts has the incident history). That gate asked "does this
 * player own a wide-ring town ANYWHERE" and, once true, widened every one of
 * that player's support-tile scans -- including ones nowhere near the actual
 * town. This asks the narrower, correct question instead: "could THIS
 * specific candidate (x, y) actually belong to one of the player's wide-ring
 * towns" -- only true when (x, y) is within MAX_SUPPORT_RING_RADIUS of one of
 * them. Everywhere else (the overwhelming majority of a large empire's
 * frontier/support checks) gets the cheap radius-1 scan, exactly like a
 * player with no wide-ring town at all -- fixing the cost blowup a large,
 * spread-out empire triggered (see town-growth.ts's incident note) without
 * giving up the second ring itself.
 *
 * Only for callers scanning OUTWARD from a support tile whose owning town
 * isn't known yet (supportTileBelongsToTown, assignedTownKeyForSupportTile,
 * live-town-summary.ts's own copy) -- a caller who already has a specific
 * town in hand should keep calling supportRingRadiusForTier(town's own tier)
 * directly (hasSupportedStructure/countSupportedStructures,
 * supportedConverterGoldPerMinuteForTown); that scan was never the cost
 * problem since it's already scoped to just that one town.
 */
export const wideSupportRingScanRadiusFor = <T extends { x: number; y: number }>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  x: number,
  y: number,
  isOwnedWideRingTown: (tile: T) => boolean
): number => {
  let perPlayer = wideSupportRingTownPositionsCache.get(tiles);
  if (!perPlayer) {
    perPlayer = new Map();
    wideSupportRingTownPositionsCache.set(tiles, perPlayer);
  }
  let positions = perPlayer.get(playerId);
  if (!positions) {
    positions = [];
    for (const tile of tiles.values()) {
      if (isOwnedWideRingTown(tile)) positions.push({ x: tile.x, y: tile.y });
    }
    perPlayer.set(playerId, positions);
  }
  for (const town of positions) {
    if (chebyshevWithWrap(x, y, town.x, town.y) <= MAX_SUPPORT_RING_RADIUS) return MAX_SUPPORT_RING_RADIUS;
  }
  return 1;
};
