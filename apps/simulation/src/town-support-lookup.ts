/**
 * Shared "town support tile" lookup logic — generic over any tile shape that
 * carries the fields needed to place MARKET/GRANARY/BANK-style structures
 * (placementMode: "town_support" in structure-placement-metadata.ts).
 *
 * This is the SINGLE source of truth for "does an open, correctly-assigned
 * support tile exist next to this town" — used both by the runtime's actual
 * command handler (runtime-structure-support.ts, DomainTileState) and by the
 * AI's candidate selector (structure-command-planner.ts's chooseBestEconomicBuild,
 * StructurePlannerTile). Before this was shared, the AI planner proposed
 * MARKET/BANK/GRANARY whenever a town's supportCurrent < supportMax, without
 * checking whether a physical open SETTLED neighbor tile actually existed to
 * host the structure — the runtime's stricter placement check then rejected
 * ~99.9% of those BUILD_ECONOMIC_STRUCTURE commands in production (see
 * docs/agents/topics/ai-planner.md), silently burning the AI's action budget
 * every tick instead of falling through to a class that could actually execute.
 */

import { structureShowsOnTile, type EconomicStructureType, type OwnershipState, type ResourceType } from "@border-empires/shared";
import { forEachFrontierNeighbor } from "./frontier-topology.js";

export type TownSupportTile = {
  x: number;
  y: number;
  ownerId?: string | undefined;
  ownershipState?: OwnershipState | undefined;
  resource?: ResourceType | undefined;
  dockId?: string | undefined;
  town?: { populationTier?: string | undefined } | null | undefined;
  fort?: unknown | null | undefined;
  observatory?: unknown | null | undefined;
  siegeOutpost?: unknown | null | undefined;
  economicStructure?: { ownerId?: string | undefined; type?: EconomicStructureType | undefined } | null | undefined;
};

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const adjacentTileStates = <T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  x: number,
  y: number
): T[] => {
  const result: T[] = [];
  forEachFrontierNeighbor(x, y, (nx, ny) => {
    const tile = tiles.get(tileKeyOf(nx, ny));
    if (tile) result.push(tile);
  });
  return result;
};

export function supportedTownKeysForTile<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  x: number,
  y: number
): string[] {
  const townKey = assignedTownKeyForSupportTile(tiles, playerId, x, y);
  return townKey ? [townKey] : [];
}

export function assignedTownKeyForSupportTile<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  x: number,
  y: number
): string | undefined {
  return adjacentTileStates(tiles, x, y)
    .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.town && tile.town.populationTier !== "SETTLEMENT")
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((tile) => tileKeyOf(tile.x, tile.y))[0];
}

export function supportedDockKeysForTile<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  x: number,
  y: number
): string[] {
  return adjacentTileStates(tiles, x, y)
    .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.dockId)
    .map((tile) => tileKeyOf(tile.x, tile.y));
}

export function economicStructureForSupportedTown<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): T | undefined {
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

/**
 * Finds the first open, correctly-assigned SETTLED tile adjacent to the given
 * town that can host `structureType`. Returns undefined when no such tile
 * exists — this is the exact condition the runtime rejects
 * BUILD_ECONOMIC_STRUCTURE for ("needs an open support tile next to this
 * town"), so any caller proposing a town-support structure as a command
 * candidate MUST check this first (see chooseBestEconomicBuild).
 */
export function firstAvailableTownSupportTile<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): T | undefined {
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
