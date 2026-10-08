/**
 * Town +1 vision bonus — "every owned SETTLED town tile's own reveal is
 * radius+1", at every population tier including a bare SETTLEMENT. Kept out
 * of runtime.ts (already oversized) so the runtime only carries a handful of
 * one-line calls into the streaming coverage cache.
 *
 * An owned SETTLED AFC rides the same ring, widened to at least
 * AFC_VISION_RADIUS: territory vision is only one tile past owned ground, so
 * a spawn whose TOWN_REACH_RADIUS disk a rival's reach already covered (and
 * so never auto-claimed) would otherwise see almost nothing around its AFC.
 *
 * The full-export path (runtime-visibility-classifier.ts) and the streaming
 * tile-delta path both read town rings from the same VisibilityCoverageTracker
 * this module writes to; the barb-activation union (runtime-visible-state.ts)
 * has its own separate, independent computation. This module owns the shared
 * "is this a settled town" test plus the town-ring add/remove/resync calls.
 */

import type { DomainTileState } from "@border-empires/game-domain";
import { AFC_VISION_RADIUS } from "@border-empires/shared";
import { effectiveVisionRadiusForPlayer, townVisionRadiusBonusForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import type { RuntimePlayer } from "../runtime-types.js";
import type { VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";

/** A SETTLED tile owned by someone with a real town, at any population tier. */
export const isSettledTownTile = (tile: DomainTileState | undefined): boolean =>
  Boolean(tile?.ownerId && tile.ownershipState === "SETTLED" && tile.town);

/** A SETTLED tile its owner holds an AFC on — same test gatherReachAnchors uses for the AFC's TOWN-radius anchor. */
export const isSettledAfcTile = (tile: DomainTileState | undefined): boolean =>
  Boolean(tile?.ownerId && tile.ownershipState === "SETTLED" && tile.afc);

const projectsTownRing = (tile: DomainTileState | undefined): boolean => isSettledTownTile(tile) || isSettledAfcTile(tile);

// Unconditional +1 (every town, always) plus Cartography's townVisionRadiusBonus
// tech effect (§ tech-domain-bridge.ts) on top. An AFC never sees less than
// AFC_VISION_RADIUS, and grows with the same bonuses once they exceed it.
const townVisionBonusRadiusFor = (players: ReadonlyMap<string, RuntimePlayer>, playerId: string, isAfc: boolean): number => {
  const player = players.get(playerId);
  const base = player ? effectiveVisionRadiusForPlayer(player) : 1;
  const techBonus = player ? townVisionRadiusBonusForPlayer(player) : 0;
  const townRadius = base + 1 + techBonus;
  return isAfc ? Math.max(AFC_VISION_RADIUS, townRadius) : townRadius;
};

export type TownVisionCoverageDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  coverage: {
    setTownVisionBonus: (sourceId: string, x: number, y: number, bonusRadius: number, callbacks?: VisibilityTransitionCallbacks) => void;
    removeTownVisionBonus: (sourceId: string, x: number, y: number, callbacks?: VisibilityTransitionCallbacks) => void;
  };
  callbacks?: VisibilityTransitionCallbacks;
};

/** Add the ring for every player-owned town or AFC present at boot. */
export const seedTownVisionBonus = (deps: TownVisionCoverageDeps, tile: DomainTileState): void => {
  if (!projectsTownRing(tile) || !tile.ownerId) return;
  deps.coverage.setTownVisionBonus(tile.ownerId, tile.x, tile.y, townVisionBonusRadiusFor(deps.players, tile.ownerId, isSettledAfcTile(tile)), deps.callbacks);
};

/** Reconcile the ring when a tile's town/AFC status or owner changes. */
export const reconcileTownVisionBonus = (
  deps: TownVisionCoverageDeps,
  previous: DomainTileState | undefined,
  next: DomainTileState
): void => {
  const prevOwner = previous?.ownerId;
  const nextOwner = next.ownerId;
  const prevProjects = projectsTownRing(previous);
  const nextProjects = projectsTownRing(next);
  if (prevProjects && prevOwner && !(nextProjects && nextOwner === prevOwner)) {
    deps.coverage.removeTownVisionBonus(prevOwner, next.x, next.y, deps.callbacks);
  }
  // Re-set (not only on first appearance) so a town/AFC swap on a tile the
  // owner keeps moves the ring to the right radius; setTownVisionBonus is a
  // no-op when the radius is unchanged.
  if (nextProjects && nextOwner) {
    deps.coverage.setTownVisionBonus(nextOwner, next.x, next.y, townVisionBonusRadiusFor(deps.players, nextOwner, isSettledAfcTile(next)), deps.callbacks);
  }
};

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const comma = tileKey.indexOf(",");
  if (comma < 0) return undefined;
  const x = Number(tileKey.slice(0, comma));
  const y = Number(tileKey.slice(comma + 1));
  return Number.isInteger(x) && Number.isInteger(y) ? { x, y } : undefined;
};

/** Re-apply every town and AFC ring at a new base radius after a vision change. */
export const resyncPlayerTownVisionBonuses = (
  deps: TownVisionCoverageDeps,
  playerId: string,
  ownedTownTierByTile: ReadonlyMap<string, string>,
  ownedAfcTileKeys: Iterable<string> = []
): void => {
  for (const townKey of ownedTownTierByTile.keys()) {
    const coords = parseTileKey(townKey);
    if (coords) deps.coverage.setTownVisionBonus(playerId, coords.x, coords.y, townVisionBonusRadiusFor(deps.players, playerId, false), deps.callbacks);
  }
  for (const afcKey of ownedAfcTileKeys) {
    const coords = parseTileKey(afcKey);
    if (coords) deps.coverage.setTownVisionBonus(playerId, coords.x, coords.y, townVisionBonusRadiusFor(deps.players, playerId, true), deps.callbacks);
  }
};
