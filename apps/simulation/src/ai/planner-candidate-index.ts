import type { DomainTileState } from "@border-empires/game-domain";

import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";

const ownerIdsNearTile = (
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): Set<string> => {
  const owners = new Set<string>();
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const ownerId = tilesByKey.get(`${nx},${ny}`)?.ownerId;
    if (ownerId) owners.add(ownerId);
  });
  return owners;
};

const supportedTownCount = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town) count += 1;
  });
  return count;
};

const supportedDockCount = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighbor = tilesByKey.get(`${nx},${ny}`);
    if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.dockId) count += 1;
  });
  return count;
};

const hasHostileNeighbor = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean => {
  let found = false;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (!found) {
      const neighbor = tilesByKey.get(`${nx},${ny}`);
      if (neighbor && neighbor.terrain === "LAND" && neighbor.ownerId && neighbor.ownerId !== playerId) found = true;
    }
  });
  return found;
};

const hasStrategicNeutralNeighbor = (
  playerId: string,
  tile: DomainTileState,
  tilesByKey: ReadonlyMap<string, DomainTileState>
): boolean => {
  let found = false;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (!found) {
      const neighbor = tilesByKey.get(`${nx},${ny}`);
      if (neighbor && neighbor.terrain === "LAND" && !neighbor.ownerId && (neighbor.resource || neighbor.dockId || neighbor.town)) found = true;
    }
  });
  return found;
};

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
      forEachFrontierNeighbor(cx, cy, (nx, ny) => {
        const neighborKey = `${nx},${ny}`;
        if (keys.has(neighborKey)) return;
        keys.add(neighborKey);
        nextFrontier.add(neighborKey);
      });
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
