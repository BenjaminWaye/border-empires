import type { DomainTileState } from "@border-empires/game-domain";
import type { DockLandingIndex } from "@border-empires/shared";
import { isFrontierAdjacent } from "../frontier-adjacency/frontier-adjacency.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import type { ActiveAetherBridgeView } from "../runtime-types.js";

/**
 * Pure dock/aether-bridge crossing lookup helpers extracted out of
 * runtime.ts (Stage 2 of the god-class breakup plan). Each of these is a
 * thin lookup over a precomputed index (the dock landing index) or a small
 * loop over an already-computed active-bridge list, so they convert
 * directly into free functions with no context-object indirection.
 */

// A dock crossing (ATTACK or EXPAND) from `from` lands on the landing ground
// of a dock it links to: the linked dock itself or a coastal tile beside it
// (packages/shared dock-landing). Whether the target is LAND right now is
// checked by validateFrontierCommand.
export function isDockCrossingTarget(
  from: DomainTileState,
  toX: number,
  toY: number,
  dockLanding: DockLandingIndex
): boolean {
  return (dockLanding.landingTileKeysByOriginDockKey.get(simulationTileKey(from.x, from.y)) ?? []).includes(
    simulationTileKey(toX, toY)
  );
}

export function isAetherBridgeCrossingTarget(
  activeBridges: readonly ActiveAetherBridgeView[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): boolean {
  for (const bridge of activeBridges) {
    if (
      bridge.from.x === fromX &&
      bridge.from.y === fromY &&
      bridge.to.x === toX &&
      bridge.to.y === toY
    ) {
      return true;
    }
  }
  return false;
}

export type DockCrossingOrigin = { tile: DomainTileState; isAlliedDockCrossing: boolean };

function actorControlsDockNetwork(
  tiles: ReadonlyMap<string, DomainTileState>,
  networkTileKeys: ReadonlySet<string>,
  actorId: string
): boolean {
  for (const networkTileKey of networkTileKeys) {
    if (tiles.get(networkTileKey)?.ownerId === actorId) return true;
  }
  return false;
}

export function findOwnedDockOriginForCrossing(
  tiles: ReadonlyMap<string, DomainTileState>,
  actor: { id: string; allies: ReadonlySet<string>; truces?: ReadonlySet<string> },
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  dockNetworkComponentByTileKey: ReadonlyMap<string, ReadonlySet<string>>,
  dockLanding: DockLandingIndex
): DockCrossingOrigin | undefined {
  // Own docks: the sea-lane edges list, for a landing tile, every dock that
  // can land on it, so the candidates come straight from the target tile
  // rather than from a scan of the actor's territory. The edges are
  // symmetric (a dock target also lists its own landing ground), so each
  // candidate is confirmed as an origin for this target.
  const targetTileKey = simulationTileKey(toX, toY);
  for (const originTileKey of dockLanding.seaLaneNeighborKeysByTileKey.get(targetTileKey) ?? []) {
    const tile = tiles.get(originTileKey);
    if (!tile || tile.ownerId !== actor.id || tile.terrain !== "LAND") continue;
    if (isDockCrossingTarget(tile, toX, toY, dockLanding)) {
      return { tile, isAlliedDockCrossing: false };
    }
  }

  // Allied docks: an ally's (or truce partner's) dock tile linked to the
  // target is also a valid crossing origin, as long as the actor controls
  // at least one dock somewhere in that same connected dock network — not
  // necessarily the specific linked tile itself. Sharing dock access is a
  // benefit of alliance, but it still requires the actor to hold a foothold
  // in the network. dockLinksByDockTileKey is built symmetrically (a dock's
  // link list always includes anything that links back to it), so the
  // target tile's own entry gives the candidate origins directly.
  for (const originTileKey of dockLinksByDockTileKey.get(targetTileKey) ?? []) {
    const tile = tiles.get(originTileKey);
    if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id) continue;
    if (!isAlliedOrTruced(actor, tile.ownerId)) continue;
    const networkTileKeys = dockNetworkComponentByTileKey.get(originTileKey);
    if (!networkTileKeys) continue;
    if (actorControlsDockNetwork(tiles, networkTileKeys, actor.id)) {
      return { tile, isAlliedDockCrossing: true };
    }
  }

  // Allied dock as a launch point onto ITS OWN grid-neighbors: the target
  // isn't the dock itself but an ordinary land tile next to an ally's dock.
  // The ally's dock still has to be one you can actually reach (linked to a
  // dock network you control), same requirement as the branch above — this
  // only extends "land on the dock" to "land next to the dock", it does not
  // open up the ally's wider territory.
  for (const allyDockTileKey of dockLinksByDockTileKey.keys()) {
    const allyTile = tiles.get(allyDockTileKey);
    if (!allyTile || allyTile.terrain !== "LAND" || !allyTile.ownerId || allyTile.ownerId === actor.id) continue;
    if (!isAlliedOrTruced(actor, allyTile.ownerId)) continue;
    if (!isFrontierAdjacent(allyTile.x, allyTile.y, toX, toY)) continue;
    const networkTileKeys = dockNetworkComponentByTileKey.get(allyDockTileKey);
    if (!networkTileKeys) continue;
    if (actorControlsDockNetwork(tiles, networkTileKeys, actor.id)) {
      return { tile: allyTile, isAlliedDockCrossing: true };
    }
  }
  return undefined;
}

// Thin resolver so the runtime.ts call site stays a one-liner: looks up the
// acting player before delegating to findOwnedDockOriginForCrossing.
export function resolveOwnedDockOriginForCrossing(
  state: {
    tiles: ReadonlyMap<string, DomainTileState>;
    players: ReadonlyMap<string, { id: string; allies: ReadonlySet<string>; truces?: ReadonlySet<string> }>;
    dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
    dockNetworkComponentByTileKey: ReadonlyMap<string, ReadonlySet<string>>;
    dockLanding: DockLandingIndex;
  },
  playerId: string,
  toX: number,
  toY: number
): DockCrossingOrigin | undefined {
  const actor = state.players.get(playerId);
  if (!actor) return undefined;
  return findOwnedDockOriginForCrossing(
    state.tiles,
    actor,
    toX,
    toY,
    state.dockLinksByDockTileKey,
    state.dockNetworkComponentByTileKey,
    state.dockLanding
  );
}

export function findOwnedAetherBridgeOriginForCrossing(
  tiles: ReadonlyMap<string, DomainTileState>,
  activeBridges: readonly ActiveAetherBridgeView[],
  playerId: string,
  toX: number,
  toY: number
): DomainTileState | undefined {
  for (const bridge of activeBridges) {
    if (bridge.to.x !== toX || bridge.to.y !== toY) continue;
    const origin = tiles.get(simulationTileKey(bridge.from.x, bridge.from.y));
    if (origin?.ownerId === playerId) return origin;
  }
  return undefined;
}
