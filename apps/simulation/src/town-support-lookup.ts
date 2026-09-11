/**
 * Shared "town support tile" lookup logic — generic over any tile shape that
 * carries the fields needed to place MINTWORKS/GRANARY-style structures
 * (placementMode: "town_support" in structure-placement-metadata.ts).
 *
 * This is the SINGLE source of truth for "does an open, correctly-assigned
 * support tile exist next to this town" — used both by the runtime's actual
 * command handler (runtime-structure-support.ts, DomainTileState) and by the
 * AI's candidate selector (structure-command-planner.ts's chooseBestEconomicBuild,
 * StructurePlannerTile). Before this was shared, the AI planner proposed
 * MINTWORKS/GRANARY whenever a town's supportCurrent < supportMax, without
 * checking whether a physical open SETTLED neighbor tile actually existed to
 * host the structure — the runtime's stricter placement check then rejected
 * ~99.9% of those BUILD_ECONOMIC_STRUCTURE commands in production (see
 * docs/agents/topics/ai-planner.md), silently burning the AI's action budget
 * every tick instead of falling through to a class that could actually execute.
 */

import {
  MAX_SUPPORT_RING_RADIUS,
  playerHasWideSupportRingTown,
  structureShowsOnTile,
  supportRingCandidates,
  supportRingRadiusForTier,
  type EconomicStructureType,
  type OwnershipState,
  type ResourceType
} from "@border-empires/shared";
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

// Fixed 8-neighbor scan (Chebyshev radius 1) -- still correct for docks,
// which never get a wider ring regardless of any nearby town's tier.
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

const isOwnedWideRingTown = <T extends TownSupportTile>(playerId: string) => (tile: T): boolean =>
  tile.ownerId === playerId && tile.ownershipState === "SETTLED" && (tile.town?.populationTier === "GREAT_CITY" || tile.town?.populationTier === "METROPOLIS");

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
  // Only scan past radius 1 when this player actually owns a GREAT_CITY/
  // METROPOLIS town somewhere -- otherwise no candidate out there could ever
  // pass the per-candidate radius filter below, so scanning it is wasted
  // work. See MAX_SUPPORT_RING_RADIUS's doc comment (town-growth.ts).
  const scanRadius = playerHasWideSupportRingTown(playerId, tiles, isOwnedWideRingTown<T>(playerId))
    ? MAX_SUPPORT_RING_RADIUS
    : 1;
  return supportRingCandidates(tiles, x, y, scanRadius)
    .filter(
      ({ tile, dx, dy }) =>
        tile.ownerId === playerId &&
        tile.ownershipState === "SETTLED" &&
        tile.town &&
        tile.town.populationTier !== "SETTLEMENT" &&
        Math.max(Math.abs(dx), Math.abs(dy)) <= supportRingRadiusForTier(tile.town.populationTier)
    )
    .map(({ tile }) => tile)
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
  const radius = supportRingRadiusForTier(tiles.get(townKey)?.town?.populationTier);
  return supportRingCandidates(tiles, townX, townY, radius)
    .map(({ tile }) => tile)
    .find(
      (tile) =>
        assignedTownKeyForSupportTile(tiles, playerId, tile.x, tile.y) === townKey &&
        tile.ownerId === playerId &&
        tile.economicStructure?.ownerId === playerId &&
        tile.economicStructure.type === structureType
    );
}

/**
 * Every economic structure type already built on a correctly-assigned
 * support tile next to this town, as a Set for O(1) membership checks.
 * Computed once per town via a single neighbor scan (8-neighbor for most
 * tiers, 24 for GREAT_CITY/METROPOLIS, plus a per-neighbor assignment
 * check) — callers checking multiple candidate structure types for the
 * same town (e.g. MINTWORKS/GRANARY) MUST call this once and reuse the Set
 * instead of calling economicStructureForSupportedTown per type, which
 * would repeat the full neighbor scan once per candidate.
 */
export function economicStructureTypesForSupportedTown<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  townKey: string
): ReadonlySet<EconomicStructureType> {
  const [townXRaw, townYRaw] = townKey.split(",");
  const townX = Number(townXRaw);
  const townY = Number(townYRaw);
  const radius = supportRingRadiusForTier(tiles.get(townKey)?.town?.populationTier);
  const types = new Set<EconomicStructureType>();
  for (const { tile } of supportRingCandidates(tiles, townX, townY, radius)) {
    if (
      tile.ownerId === playerId &&
      tile.economicStructure?.ownerId === playerId &&
      tile.economicStructure.type &&
      assignedTownKeyForSupportTile(tiles, playerId, tile.x, tile.y) === townKey
    ) {
      types.add(tile.economicStructure.type);
    }
  }
  return types;
}

/**
 * Returns every open, correctly-assigned SETTLED tile adjacent to the given
 * town that has no structure yet — i.e. every tile that COULD host a
 * town-support structure, before checking any particular structureType's
 * placement rules. This is the expensive part (a neighbor scan -- 8-neighbor
 * for most tiers, 24 for GREAT_CITY/METROPOLIS -- plus a per-candidate
 * assignment check) — callers checking multiple structure types for the same
 * town (e.g. MINTWORKS/GRANARY, which all share identical placement rules
 * today — see structure-placement-metadata.ts) should call this ONCE and
 * reuse the result instead of re-scanning per type.
 */
export function openTownSupportNeighborTiles<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  townKey: string
): T[] {
  const [townXRaw, townYRaw] = townKey.split(",");
  const townX = Number(townXRaw);
  const townY = Number(townYRaw);
  const radius = supportRingRadiusForTier(tiles.get(townKey)?.town?.populationTier);
  return supportRingCandidates(tiles, townX, townY, radius)
    .map(({ tile }) => tile)
    .filter((tile) => {
      if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return false;
      if (tile.town || tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) return false;
      return assignedTownKeyForSupportTile(tiles, playerId, tile.x, tile.y) === townKey;
    });
}

/**
 * Cheap, per-tile check: does `structureType` show on this already-known
 * candidate tile? Pair with openTownSupportNeighborTiles (computed once) to
 * check multiple structure types for the same town without repeating the
 * expensive neighbor scan per type.
 */
export const townSupportStructureShowsOnTile = <T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  tile: T,
  structureType: EconomicStructureType
): boolean =>
  structureShowsOnTile(structureType, {
    ownershipState: tile.ownershipState,
    resource: tile.resource,
    dockId: tile.dockId,
    townPopulationTier: undefined,
    supportedTownCount: supportedTownKeysForTile(tiles, playerId, tile.x, tile.y).length,
    supportedDockCount: supportedDockKeysForTile(tiles, playerId, tile.x, tile.y).length
  });

/**
 * Finds the first open, correctly-assigned SETTLED tile adjacent to the given
 * town that can host `structureType`. Returns undefined when no such tile
 * exists — this is the exact condition the runtime rejects
 * BUILD_ECONOMIC_STRUCTURE for ("needs an open support tile next to this
 * town"), so any caller proposing a town-support structure as a command
 * candidate MUST check this first (see chooseBestEconomicBuild).
 *
 * Checking several structure types for the same town? Call
 * openTownSupportNeighborTiles once and check each type against that list
 * instead of calling this once per type — it repeats the full neighbor scan
 * every call.
 */
export function firstAvailableTownSupportTile<T extends TownSupportTile>(
  tiles: ReadonlyMap<string, T>,
  playerId: string,
  townKey: string,
  structureType: EconomicStructureType
): T | undefined {
  return openTownSupportNeighborTiles(tiles, playerId, townKey).find((tile) =>
    townSupportStructureShowsOnTile(tiles, playerId, tile, structureType)
  );
}
