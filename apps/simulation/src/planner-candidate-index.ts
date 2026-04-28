import type { DomainTileState } from "@border-empires/game-domain";

import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { frontierNeighborKeys } from "./frontier-topology.js";

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const ownerIdsNearTile = (
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): Set<string> => {
  const owners = new Set<string>();
  for (const neighborKey of frontierNeighborKeys(tile.x, tile.y)) {
    const ownerId = tilesByKey.get(neighborKey)?.ownerId;
    if (ownerId) owners.add(ownerId);
  }
  return owners;
};

const supportedTownCount = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => {
    const neighbor = tilesByKey.get(neighborKey);
    return count + (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town ? 1 : 0);
  }, 0);

const supportedDockCount = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => {
    const neighbor = tilesByKey.get(neighborKey);
    return count + (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.dockId ? 1 : 0);
  }, 0);

const hasHostileNeighbor = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean =>
  frontierNeighborKeys(tile.x, tile.y).some((neighborKey) => {
    const neighbor = tilesByKey.get(neighborKey);
    return Boolean(neighbor && neighbor.terrain === "LAND" && neighbor.ownerId && neighbor.ownerId !== playerId);
  });

const hasStrategicNeutralNeighbor = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean =>
  frontierNeighborKeys(tile.x, tile.y).some((neighborKey) => {
    const neighbor = tilesByKey.get(neighborKey);
    return Boolean(
      neighbor &&
      neighbor.terrain === "LAND" &&
      !neighbor.ownerId &&
      (neighbor.resource || neighbor.dockId || neighbor.town)
    );
  });

export const candidateIndexKeysAroundTileKey = (tileKey: string): Set<string> => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  const keys = new Set<string>([tileKey]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return keys;
  let frontier = [tileKey];
  for (let depth = 0; depth < 2; depth += 1) {
    const nextFrontier = new Set<string>();
    for (const currentKey of frontier) {
      const parts = currentKey.split(",");
      const cx = Number(parts[0]);
      const cy = Number(parts[1]);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      for (const neighborKey of frontierNeighborKeys(cx, cy)) {
        if (keys.has(neighborKey)) continue;
        keys.add(neighborKey);
        nextFrontier.add(neighborKey);
      }
    }
    frontier = [...nextFrontier];
  }
  return keys;
};

export const playerIdsAffectedByTileChange = (
  tileKey: string,
  tilesByKey: ReadonlyMap<string, DomainTileState>,
  previousTile?: DomainTileState,
  nextTile?: DomainTileState
): Set<string> => {
  const playerIds = new Set<string>();
  if (previousTile?.ownerId) playerIds.add(previousTile.ownerId);
  if (nextTile?.ownerId) playerIds.add(nextTile.ownerId);
  const currentTile = tilesByKey.get(tileKey);
  if (currentTile) {
    for (const ownerId of ownerIdsNearTile(currentTile, tilesByKey)) playerIds.add(ownerId);
  }
  for (const neighborKey of candidateIndexKeysAroundTileKey(tileKey)) {
    const ownerId = tilesByKey.get(neighborKey)?.ownerId;
    if (ownerId) playerIds.add(ownerId);
  }
  return playerIds;
};

export const isHotFrontierTile = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean =>
  tile.ownerId === playerId &&
  tile.ownershipState === "FRONTIER" &&
  (hasHostileNeighbor(playerId, tile, tilesByKey) || hasStrategicNeutralNeighbor(playerId, tile, tilesByKey));

export const isStrategicFrontierTile = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean =>
  tile.ownerId === playerId &&
  tile.ownershipState === "FRONTIER" &&
  evaluateSettlementCandidate(playerId, tile, tilesByKey).strategic;

export const isBuildCandidateTile = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean =>
  tile.ownerId === playerId &&
  tile.ownershipState === "SETTLED" &&
  tile.terrain === "LAND" &&
  (
    Boolean(tile.resource || tile.dockId || tile.town) ||
    supportedTownCount(playerId, tile, tilesByKey) > 0 ||
    supportedDockCount(playerId, tile, tilesByKey) > 0 ||
    hasHostileNeighbor(playerId, tile, tilesByKey)
  );

export const plannerCandidateIndexKey = tileKeyOf;
