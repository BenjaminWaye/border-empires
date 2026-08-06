/**
 * Outpost vision bonus — an owned active, non-dormant Light Outpost reveals
 * LIGHT_OUTPOST_VISION_BONUS (config.ts) tiles around itself; an owned active
 * Siege Outpost (any tier) has no bonus of its own. Survey Corps's
 * outpostVisionRadiusBonus tech effect adds a further, tech-driven radius on
 * top of either. A manually disabled outpost (status "inactive") or one that's
 * currently dormant (§5.4 — short its required resource slot) grants no bonus
 * at all, same as one still under construction.
 *
 * Kept out of runtime.ts (already oversized), mirroring runtime-town-vision.ts's
 * shape: reconcile on every replaceTileState (structure build/upgrade/removal/
 * manual toggle all funnel through it) plus a resync hook for when the tech
 * itself is chosen or dormancy could have shifted (a resource tile gained or
 * lost elsewhere in the player's territory doesn't touch the outpost's own
 * tile, so it can't rely on that tile's own reconcile call), so an in-flight
 * Light Outpost -> Siege Outpost upgrade, a fresh Survey Corps unlock, or a
 * FOOD/SUPPLY slot going from free to short (or back) all recompute the bonus
 * from current tile + tech + dormancy state rather than relying on matched
 * add/remove call sites.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { LIGHT_OUTPOST_VISION_BONUS } from "@border-empires/shared";
import { outpostVisionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { RuntimePlayer } from "./runtime-types.js";
import type { VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

type OutpostBonusStructureType = "LIGHT_OUTPOST" | "SIEGE_OUTPOST";
type OutpostBonusField = "siegeOutpost" | "economicStructure";

// A structure counts as "present" (and so is eligible for whatever vision
// bonus it grants) from the moment it goes active through its removal grace
// period. "under_construction" (not yet built) and "inactive" (manually
// disabled via the Enable/Disable action) are both excluded — matching how
// every other effect a structure grants stops the moment it's toggled off,
// not just once it's fully gone.
const isPresent = (status: string): boolean => status === "active" || status === "removing";

/**
 * The active outpost bonus source on `tile`, if any, owned by `ownerId`.
 * Siege Outpost is checked first: upgrading a Light Outpost in place leaves
 * a stale `economicStructure` entry behind on the tile (a pre-existing
 * data-model quirk unrelated to vision — runtime-structure-command-handlers.ts's
 * `completeStructureBuild` only clears the old economicStructure for the
 * Wooden Fort -> Fort transition, not Light Outpost -> Siege Outpost), so an
 * active siegeOutpost always wins over a stale LIGHT_OUTPOST leftover.
 */
export const outpostVisionBonusStructureType = (
  tile: DomainTileState | undefined,
  ownerId: string | undefined
): OutpostBonusStructureType | undefined => {
  if (!tile || !ownerId) return undefined;
  if (tile.siegeOutpost?.ownerId === ownerId && isPresent(tile.siegeOutpost.status)) return "SIEGE_OUTPOST";
  if (
    tile.economicStructure?.ownerId === ownerId &&
    tile.economicStructure.type === "LIGHT_OUTPOST" &&
    isPresent(tile.economicStructure.status)
  ) {
    return "LIGHT_OUTPOST";
  }
  return undefined;
};

const fieldForStructureType = (type: OutpostBonusStructureType): OutpostBonusField =>
  type === "SIEGE_OUTPOST" ? "siegeOutpost" : "economicStructure";

const outpostVisionBonusRadiusFor = (
  players: ReadonlyMap<string, RuntimePlayer>,
  playerId: string,
  structureType: OutpostBonusStructureType
): number => {
  const player = players.get(playerId);
  const techBonus = player ? outpostVisionRadiusBonusForPlayer(player) : 0;
  const base = structureType === "LIGHT_OUTPOST" ? LIGHT_OUTPOST_VISION_BONUS : 0;
  return base + techBonus;
};

export type OutpostVisionCoverageDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  // §5.4: whether the given (owner, tileKey, field) structure is currently
  // short its required resource slot — mirrors Runtime.isStructureDormant.
  // A dormant outpost grants no vision bonus, same as a disabled one.
  isStructureDormant: (ownerId: string, tileKey: string, field: OutpostBonusField) => boolean;
  coverage: {
    setOutpostVisionBonus: (sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks) => void;
    removeOutpostVisionBonus: (sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks) => void;
  };
  callbacks?: VisibilityTransitionCallbacks;
};

/**
 * Recomputes the correct outpost vision bonus for `tile.ownerId` at `tile`'s
 * position from current structure + tech + dormancy state, and either sets or
 * clears the tracked bonus to match — a single idempotent entry point used by
 * every caller below (seed / reconcile / resync) instead of separately paired
 * add/remove calls, so dormancy (which can flip without this tile itself
 * changing) is always re-checked rather than assumed unchanged.
 */
const applyOutpostVisionBonusForTile = (deps: OutpostVisionCoverageDeps, tile: DomainTileState): void => {
  const ownerId = tile.ownerId;
  if (!ownerId) return;
  const structureType = outpostVisionBonusStructureType(tile, ownerId);
  const dormant = structureType
    ? deps.isStructureDormant(ownerId, simulationTileKey(tile.x, tile.y), fieldForStructureType(structureType))
    : false;
  const radius = structureType && !dormant ? outpostVisionBonusRadiusFor(deps.players, ownerId, structureType) : 0;
  if (radius <= 0) {
    deps.coverage.removeOutpostVisionBonus(ownerId, tile.x, tile.y, deps.callbacks);
    return;
  }
  deps.coverage.setOutpostVisionBonus(ownerId, tile.x, tile.y, radius, deps.callbacks);
};

/** Seed the bonus for every player-owned active outpost present at boot. */
export const seedOutpostVisionBonus = (deps: OutpostVisionCoverageDeps, tile: DomainTileState): void => {
  applyOutpostVisionBonusForTile(deps, tile);
};

/** Reconcile the bonus when a tile's outpost structure, status, or owner changes. */
export const reconcileOutpostVisionBonus = (
  deps: OutpostVisionCoverageDeps,
  previous: DomainTileState | undefined,
  next: DomainTileState
): void => {
  // Ownership changing away is the one case applyOutpostVisionBonusForTile(next)
  // below can't see on its own — it only ever (re)computes for next's current
  // owner, so the old owner's tracked bonus (if any) must be cleared here.
  if (previous?.ownerId && previous.ownerId !== next.ownerId) {
    deps.coverage.removeOutpostVisionBonus(previous.ownerId, next.x, next.y, deps.callbacks);
  }
  applyOutpostVisionBonusForTile(deps, next);
};

/**
 * Re-apply every currently-tracked outpost bonus for a player from current
 * tile + tech + dormancy state. Used both for a tech unlock that moves every
 * owned outpost's ring (e.g. Survey Corps) and for a dormancy shift caused by
 * some other tile in the player's territory (a resource tile gained or lost
 * elsewhere changes their FOOD/SUPPLY slot totals without touching any
 * outpost tile directly). `ownedOutpostTiles` is sourced from the runtime's
 * activeLightOutpostsByOwner/activeSiegeOutpostsByOwner indexes — cheap, but
 * "active"-only, so a mid-removal outpost won't resync until some other event
 * touches its tile. Self-healing (the next reconcile recomputes from current
 * state anyway) and rare enough in practice not to warrant a full tile scan.
 */
export const resyncPlayerOutpostVisionBonuses = (
  deps: OutpostVisionCoverageDeps,
  playerId: string,
  ownedOutpostTiles: Iterable<DomainTileState>
): void => {
  for (const tile of ownedOutpostTiles) {
    if (tile.ownerId !== playerId) continue;
    applyOutpostVisionBonusForTile(deps, tile);
  }
};
