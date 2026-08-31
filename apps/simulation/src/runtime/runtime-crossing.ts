import type { DomainTileState } from "@border-empires/game-domain";
import { isValidDockCrossingTarget } from "../dock-network/dock-network.js";
import { isFrontierAdjacent } from "../frontier-adjacency/frontier-adjacency.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { isAlliedOrTruced } from "../runtime-player-factory.js";
import type { ActiveAetherBridgeView } from "../runtime-types.js";

/**
 * Pure dock/aether-bridge crossing lookup helpers extracted out of
 * runtime.ts (Stage 2 of the god-class breakup plan). Each of these was
 * already a thin wrapper over a pure function (isValidDockCrossingTarget)
 * or a small loop over an already-computed active-bridge list, so they
 * convert directly into free functions with no context-object indirection.
 */

export function isDockCrossingTarget(
  from: DomainTileState,
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): boolean {
  return isValidDockCrossingTarget(simulationTileKey(from.x, from.y), toX, toY, dockLinksByDockTileKey);
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

export function findOwnedDockOriginForCrossing(
  tiles: ReadonlyMap<string, DomainTileState>,
  territoryTileKeys: Iterable<string>,
  actor: { id: string; allies: ReadonlySet<string>; truces?: ReadonlySet<string> },
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>,
  dockNetworkComponentByTileKey: ReadonlyMap<string, ReadonlySet<string>>
): DockCrossingOrigin | undefined {
  for (const tileKey of territoryTileKeys) {
    const tile = tiles.get(tileKey);
    if (!tile || tile.ownerId !== actor.id || tile.terrain !== "LAND") continue;
    if (isDockCrossingTarget(tile, toX, toY, dockLinksByDockTileKey)) {
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
  const targetTileKey = simulationTileKey(toX, toY);
  for (const originTileKey of dockLinksByDockTileKey.get(targetTileKey) ?? []) {
    const tile = tiles.get(originTileKey);
    if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId === actor.id) continue;
    if (!isAlliedOrTruced(actor, tile.ownerId)) continue;
    const networkTileKeys = dockNetworkComponentByTileKey.get(originTileKey);
    if (!networkTileKeys) continue;
    let controlsNetwork = false;
    for (const networkTileKey of networkTileKeys) {
      if (tiles.get(networkTileKey)?.ownerId === actor.id) {
        controlsNetwork = true;
        break;
      }
    }
    if (controlsNetwork) return { tile, isAlliedDockCrossing: true };
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
    let controlsNetwork = false;
    for (const networkTileKey of networkTileKeys) {
      if (tiles.get(networkTileKey)?.ownerId === actor.id) {
        controlsNetwork = true;
        break;
      }
    }
    if (controlsNetwork) return { tile: allyTile, isAlliedDockCrossing: true };
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
  },
  territoryTileKeysForPlayer: (playerId: string) => Iterable<string>,
  playerId: string,
  toX: number,
  toY: number
): DockCrossingOrigin | undefined {
  const actor = state.players.get(playerId);
  if (!actor) return undefined;
  return findOwnedDockOriginForCrossing(
    state.tiles,
    territoryTileKeysForPlayer(playerId),
    actor,
    toX,
    toY,
    state.dockLinksByDockTileKey,
    state.dockNetworkComponentByTileKey
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
