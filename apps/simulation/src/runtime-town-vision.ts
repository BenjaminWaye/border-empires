/**
 * Town +1 vision bonus — "every owned SETTLED town tile's own reveal is
 * radius+1", at every population tier including a bare SETTLEMENT. Kept out
 * of runtime.ts (already oversized) so the runtime only carries a handful of
 * one-line calls into the streaming coverage cache.
 *
 * Full-export path (VisionExpansionCache) and the barb-activation union are
 * handled in their own modules (runtime-visibility-classifier.ts /
 * runtime-visible-state.ts); this module owns the streaming tile-delta path
 * (VisibilityCoverageTracker) plus the shared "is this a settled town" test.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { effectiveVisionRadiusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { RuntimePlayer } from "./runtime-types.js";
import type { VisibilityTransitionCallbacks } from "./visibility-coverage-cache.js";

/** A SETTLED tile owned by someone with a real town, at any population tier. */
export const isSettledTownTile = (tile: DomainTileState | undefined): boolean =>
  Boolean(tile?.ownerId && tile.ownershipState === "SETTLED" && tile.town);

const townVisionBonusRadiusFor = (players: ReadonlyMap<string, RuntimePlayer>, playerId: string): number =>
  (players.get(playerId) ? effectiveVisionRadiusForPlayer(players.get(playerId)!) : 1) + 1;

export type TownVisionCoverageDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  coverage: {
    setTownVisionBonus: (sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks) => void;
    removeTownVisionBonus: (sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks) => void;
  };
  callbacks?: VisibilityTransitionCallbacks;
};

/** Add the +1 ring for every player-owned town present at boot. */
export const seedTownVisionBonus = (deps: TownVisionCoverageDeps, tile: DomainTileState): void => {
  if (!isSettledTownTile(tile) || !tile.ownerId) return;
  deps.coverage.setTownVisionBonus(tile.ownerId, tile.x, tile.y, townVisionBonusRadiusFor(deps.players, tile.ownerId), deps.callbacks);
};

/** Reconcile the +1 ring when a tile's town status or owner changes. */
export const reconcileTownVisionBonus = (
  deps: TownVisionCoverageDeps,
  previous: DomainTileState | undefined,
  next: DomainTileState
): void => {
  const prevOwner = previous?.ownerId;
  const nextOwner = next.ownerId;
  const prevIsTown = isSettledTownTile(previous);
  const nextIsTown = isSettledTownTile(next);
  if (prevIsTown && prevOwner && !(nextIsTown && nextOwner === prevOwner)) {
    deps.coverage.removeTownVisionBonus(prevOwner, next.x, next.y, deps.callbacks);
  }
  if (nextIsTown && nextOwner && !(prevIsTown && prevOwner === nextOwner)) {
    deps.coverage.setTownVisionBonus(nextOwner, next.x, next.y, townVisionBonusRadiusFor(deps.players, nextOwner), deps.callbacks);
  }
};

/** Re-apply every town ring at a new base radius after a vision change. */
export const resyncPlayerTownVisionBonuses = (
  deps: TownVisionCoverageDeps,
  playerId: string,
  ownedTownTierByTile: ReadonlyMap<string, string>
): void => {
  for (const townKey of ownedTownTierByTile.keys()) {
    const comma = townKey.indexOf(",");
    if (comma < 0) continue;
    const tx = Number(townKey.slice(0, comma));
    const ty = Number(townKey.slice(comma + 1));
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
    deps.coverage.setTownVisionBonus(playerId, tx, ty, townVisionBonusRadiusFor(deps.players, playerId), deps.callbacks);
  }
};
