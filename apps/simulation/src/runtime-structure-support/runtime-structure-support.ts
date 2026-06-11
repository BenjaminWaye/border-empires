import type { DomainTileState } from "@border-empires/game-domain";
import { structureShowsOnTile, type EconomicStructureType } from "@border-empires/shared";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export function supportedTownKeysForTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string[] {
  const townKey = assignedTownKeyForSupportTile(tiles, playerId, x, y);
  return townKey ? [townKey] : [];
}

export function assignedTownKeyForSupportTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string | undefined {
  return adjacentTileStates(tiles, x, y)
    .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.town && tile.town.populationTier !== "SETTLEMENT")
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((tile) => simulationTileKey(tile.x, tile.y))[0];
}

export function supportedDockKeysForTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  x: number,
  y: number
): string[] {
  return adjacentTileStates(tiles, x, y)
    .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.dockId)
    .map((tile) => simulationTileKey(tile.x, tile.y));
}

export function economicStructureForSupportedTown(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): DomainTileState | undefined {
  const [townXRaw, townYRaw] = townKey.split(",");
  const townX = Number(townXRaw);
  const townY = Number(townYRaw);
  return adjacentTileStates(tiles, townX, townY).find(
    (tile) =>
      assignedTownKeyForSupportTile(tiles, playerId, tile.x, tile.y) === townKey &&
      tile.ownerId === playerId &&
      tile.economicStructure?.ownerId === playerId &&
      tile.economicStructure.type === structureType
  );
}

export function firstAvailableTownSupportTile(
  tiles: ReadonlyMap<string, DomainTileState>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): DomainTileState | undefined {
  const [townXRaw, townYRaw] = townKey.split(",");
  const townX = Number(townXRaw);
  const townY = Number(townYRaw);
  return adjacentTileStates(tiles, townX, townY).find((tile) => {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return false;
    if (tile.town || tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) return false;
    if (assignedTownKeyForSupportTile(tiles, playerId, tile.x, tile.y) !== townKey) return false;
    return structureShowsOnTile(structureType, {
      ownershipState: tile.ownershipState,
      resource: tile.resource,
      dockId: tile.dockId,
      townPopulationTier: undefined,
      supportedTownCount: supportedTownKeysForTile(tiles, playerId, tile.x, tile.y).length,
      supportedDockCount: supportedDockKeysForTile(tiles, playerId, tile.x, tile.y).length
    });
  });
}

function adjacentTileStates(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number): DomainTileState[] {
  const result: DomainTileState[] = [];
  forEachFrontierNeighbor(x, y, (nx, ny) => {
    const tile = tiles.get(simulationTileKey(nx, ny));
    if (tile) result.push(tile);
  });
  return result;
}
