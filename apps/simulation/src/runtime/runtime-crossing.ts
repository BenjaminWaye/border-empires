import type { DomainTileState } from "@border-empires/game-domain";
import { isValidDockCrossingTarget } from "../dock-network/dock-network.js";
import { simulationTileKey } from "../seed-state/seed-state.js";
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

export function findOwnedDockOriginForCrossing(
  tiles: ReadonlyMap<string, DomainTileState>,
  territoryTileKeys: Iterable<string>,
  playerId: string,
  toX: number,
  toY: number,
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>
): DomainTileState | undefined {
  for (const tileKey of territoryTileKeys) {
    const tile = tiles.get(tileKey);
    if (!tile || tile.ownerId !== playerId || tile.terrain !== "LAND") continue;
    if (isDockCrossingTarget(tile, toX, toY, dockLinksByDockTileKey)) return tile;
  }
  return undefined;
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
