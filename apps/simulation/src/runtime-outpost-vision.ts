/**
 * Outpost vision bonus — an owned active Light Outpost reveals
 * LIGHT_OUTPOST_VISION_BONUS (config.ts) tiles around itself; an owned active
 * Siege Outpost (any tier) has no bonus of its own. Survey Corps's
 * outpostVisionRadiusBonus tech effect adds a further, tech-driven radius on
 * top of either. Kept out of runtime.ts (already oversized), mirroring
 * runtime-town-vision.ts's shape exactly: reconcile on every replaceTileState
 * (structure build/upgrade/removal all funnel through it) plus a resync hook
 * for when the tech itself is chosen, so an in-flight Light Outpost -> Siege
 * Outpost upgrade or a fresh Survey Corps unlock both recompute the bonus
 * from current tile + tech state rather than relying on matched add/remove
 * call sites.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { LIGHT_OUTPOST_VISION_BONUS } from "@border-empires/shared";
import { outpostVisionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { RuntimePlayer } from "./runtime-types.js";
import type { VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

type OutpostBonusStructureType = "LIGHT_OUTPOST" | "SIEGE_OUTPOST";

// A structure counts as "present" (and so keeps whatever vision bonus it
// grants) from the moment it goes active through its removal grace period —
// only "under_construction" is excluded. Matches the pre-existing behavior
// this module replaces, which only ever removed the bonus once removal
// actually completed, not when it started.
const isPresent = (status: string): boolean => status !== "under_construction";

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
  coverage: {
    setOutpostVisionBonus: (sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks) => void;
    removeOutpostVisionBonus: (sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks) => void;
  };
  callbacks?: VisibilityTransitionCallbacks;
};

const applyOutpostVisionBonusForTile = (deps: OutpostVisionCoverageDeps, tile: DomainTileState): void => {
  const structureType = outpostVisionBonusStructureType(tile, tile.ownerId);
  if (!structureType) return;
  const radius = outpostVisionBonusRadiusFor(deps.players, tile.ownerId!, structureType);
  if (radius <= 0) return;
  deps.coverage.setOutpostVisionBonus(tile.ownerId!, tile.x, tile.y, radius, deps.callbacks);
};

/** Seed the bonus for every player-owned active outpost present at boot. */
export const seedOutpostVisionBonus = (deps: OutpostVisionCoverageDeps, tile: DomainTileState): void => {
  applyOutpostVisionBonusForTile(deps, tile);
};

/** Reconcile the bonus when a tile's outpost structure or owner changes. */
export const reconcileOutpostVisionBonus = (
  deps: OutpostVisionCoverageDeps,
  previous: DomainTileState | undefined,
  next: DomainTileState
): void => {
  const prevOwner = previous?.ownerId;
  const nextOwner = next.ownerId;
  const prevType = outpostVisionBonusStructureType(previous, prevOwner);
  const nextType = outpostVisionBonusStructureType(next, nextOwner);
  const unchanged = prevType && nextType && prevType === nextType && prevOwner === nextOwner;
  if (prevType && prevOwner && !unchanged) {
    deps.coverage.removeOutpostVisionBonus(prevOwner, next.x, next.y, deps.callbacks);
  }
  if (nextType && nextOwner && !unchanged) {
    applyOutpostVisionBonusForTile(deps, next);
  }
};

/**
 * Re-apply every currently-tracked outpost bonus for a player at a new
 * tech-driven radius after a vision-affecting tech is chosen. `ownedOutpostTiles`
 * is sourced from the runtime's activeLightOutpostsByOwner/activeSiegeOutpostsByOwner
 * indexes — cheap, but "active"-only, so a dormant (no free resource slot) or
 * mid-removal outpost won't resync until some other event touches its tile.
 * Self-healing (the next reconcile recomputes from current tech state anyway)
 * and rare enough in practice not to warrant a full tile scan on every tech pick.
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
