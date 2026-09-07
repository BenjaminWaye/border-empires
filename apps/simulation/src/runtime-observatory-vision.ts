/**
 * Observatory vision bonus — an owned active, non-dormant Observatory
 * reveals a flat OBSERVATORY_VISION_BONUS (config.ts) tiles around itself.
 * A manually disabled Observatory (status "inactive") or one that's
 * currently dormant (§5.4 — short its required CRYSTAL slot) grants no
 * bonus at all, same as one still under construction.
 *
 * Mirrors runtime-outpost-vision.ts's shape (single structure/field, no tech
 * stacking today — see structure-modifier-catalog-military.ts, which shows
 * OBSERVATORY_VISION_BONUS as a flat stat with no tech-driven variant):
 * reconcile on every replaceTileState (structure build/upgrade/removal/
 * manual toggle all funnel through it) plus a resync hook for when a
 * resource tile gained or lost elsewhere in the player's territory could
 * have shifted the Observatory's own CRYSTAL-slot dormancy without touching
 * its own tile.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { OBSERVATORY_VISION_BONUS } from "@border-empires/shared";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

// A structure counts as "present" (and so is eligible for its vision bonus)
// from the moment it goes active through its removal grace period.
// "under_construction" (not yet built) and "inactive" (manually disabled via
// the Enable/Disable action) are both excluded — matching how every other
// effect a structure grants stops the moment it's toggled off, not just once
// it's fully gone.
const isPresent = (status: string): boolean => status === "active" || status === "removing";

export type ObservatoryVisionCoverageDeps = {
  // §5.4: whether this player's Observatory at this tile is currently short
  // its CRYSTAL resource slot — mirrors Runtime.isStructureDormant. A
  // dormant Observatory grants no vision bonus, same as a disabled one.
  isStructureDormant: (ownerId: string, tileKey: string, field: "observatory") => boolean;
  coverage: {
    setObservatoryVisionBonus: (sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks) => void;
    removeObservatoryVisionBonus: (sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks) => void;
  };
  callbacks?: VisibilityTransitionCallbacks;
};

/**
 * Recomputes the correct Observatory vision bonus for `tile.observatory`'s
 * owner from current structure + dormancy state, and either sets or clears
 * the tracked bonus to match — a single idempotent entry point used by every
 * caller below (seed / reconcile / resync) instead of separately paired
 * add/remove calls, so dormancy (which can flip without this tile itself
 * changing) is always re-checked rather than assumed unchanged.
 */
const applyObservatoryVisionBonusForTile = (deps: ObservatoryVisionCoverageDeps, tile: DomainTileState): void => {
  const observatory = tile.observatory;
  // Ownership gate, mirroring runtime-outpost-vision.ts (which reads
  // tile.ownerId): a tower only sees for its owner while that owner still
  // holds the tile. A tile that was abandoned (UNCAPTURE_TILE) or unsettled
  // keeps its structures standing, so without this the former owner would
  // keep full vision from a tower on land they no longer hold -- and pay no
  // CRYSTAL slots for it, since slot demand only counts owned tiles.
  if (!observatory || !isPresent(observatory.status) || tile.ownerId !== observatory.ownerId) {
    if (observatory?.ownerId) deps.coverage.removeObservatoryVisionBonus(observatory.ownerId, tile.x, tile.y, deps.callbacks);
    return;
  }
  const ownerId = observatory.ownerId;
  const dormant = deps.isStructureDormant(ownerId, simulationTileKey(tile.x, tile.y), "observatory");
  if (dormant) {
    deps.coverage.removeObservatoryVisionBonus(ownerId, tile.x, tile.y, deps.callbacks);
    return;
  }
  deps.coverage.setObservatoryVisionBonus(ownerId, tile.x, tile.y, OBSERVATORY_VISION_BONUS, deps.callbacks);
};

/** Seed the bonus for every player-owned active Observatory present at boot. */
export const seedObservatoryVisionBonus = (deps: ObservatoryVisionCoverageDeps, tile: DomainTileState): void => {
  applyObservatoryVisionBonusForTile(deps, tile);
};

/** Reconcile the bonus when a tile's Observatory structure, status, or owner changes. */
export const reconcileObservatoryVisionBonus = (
  deps: ObservatoryVisionCoverageDeps,
  previous: DomainTileState | undefined,
  next: DomainTileState
): void => {
  // Ownership changing away is the one case applyObservatoryVisionBonusForTile(next)
  // below can't see on its own — it only ever (re)computes for next's own
  // observatory owner, so the previous owner's tracked bonus (if any) must be
  // cleared here.
  if (previous?.observatory?.ownerId && previous.observatory.ownerId !== next.observatory?.ownerId) {
    deps.coverage.removeObservatoryVisionBonus(previous.observatory.ownerId, next.x, next.y, deps.callbacks);
  }
  applyObservatoryVisionBonusForTile(deps, next);
};

/**
 * Re-apply every currently-tracked Observatory bonus for a player from
 * current tile + dormancy state. Used for a dormancy shift caused by some
 * other tile in the player's territory (a CRYSTAL tile gained or lost
 * elsewhere changes their CRYSTAL slot totals without touching any
 * Observatory tile directly). `ownedObservatoryTiles` is sourced from the
 * runtime's activeObservatoriesByOwner index — cheap, but "active"-only, so
 * a mid-removal Observatory won't resync until some other event touches its
 * tile. Self-healing (the next reconcile recomputes from current state
 * anyway) and rare enough in practice not to warrant a full tile scan.
 */
export const resyncPlayerObservatoryVisionBonuses = (
  deps: ObservatoryVisionCoverageDeps,
  playerId: string,
  ownedObservatoryTiles: Iterable<DomainTileState>
): void => {
  for (const tile of ownedObservatoryTiles) {
    if (tile.observatory?.ownerId !== playerId) continue;
    applyObservatoryVisionBonusForTile(deps, tile);
  }
};
