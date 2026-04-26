import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  structureBuildGoldCost,
  structureCostDefinition,
  structureShowsOnTile,
  type EconomicStructureType
} from "@border-empires/shared";

import { frontierNeighborKeys } from "./frontier-topology.js";

type StrategicResourceKey = DomainStrategicResourceKey;

export type StructurePlannerPlayer = {
  id: string;
  points: number;
  techIds?: readonly string[];
  strategicResources?: Partial<Record<StrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
};

export type StructurePlannerTile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | undefined;
  resource?: DomainTileState["resource"] | undefined;
  dockId?: string | undefined;
  town?: {
    supportMax?: number | undefined;
    supportCurrent?: number | undefined;
    populationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined;
  } | null | undefined;
  fort?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  observatory?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  siegeOutpost?: { ownerId?: string | undefined; status?: string | undefined } | null | undefined;
  economicStructure?: { ownerId?: string | undefined; type?: EconomicStructureType | undefined; status?: string | undefined } | null | undefined;
};

type TileLookup = ReadonlyMap<string, StructurePlannerTile>;

const resourceStock = (
  player: StructurePlannerPlayer,
  resource: StrategicResourceKey
): number => Math.max(0, player.strategicResources?.[resource] ?? 0);

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const ownedStructureCount = (
  playerId: string,
  tiles: Iterable<StructurePlannerTile>,
  structureKind: "FORT" | "SIEGE_OUTPOST" | EconomicStructureType
): number => {
  let count = 0;
  for (const tile of tiles) {
    if (structureKind === "FORT" && tile.fort?.ownerId === playerId) count += 1;
    else if (structureKind === "SIEGE_OUTPOST" && tile.siegeOutpost?.ownerId === playerId) count += 1;
    else if (tile.economicStructure?.ownerId === playerId && tile.economicStructure.type === structureKind) count += 1;
  }
  return count;
};

const supportedTownCount = (playerId: string, tile: StructurePlannerTile, tilesByKey: TileLookup): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => {
    const neighbor = tilesByKey.get(neighborKey);
    return count + (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town ? 1 : 0);
  }, 0);

const supportedDockCount = (playerId: string, tile: StructurePlannerTile, tilesByKey: TileLookup): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => {
    const neighbor = tilesByKey.get(neighborKey);
    return count + (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.dockId ? 1 : 0);
  }, 0);

const tileOpenForStructure = (tile: StructurePlannerTile): boolean =>
  !tile.fort && !tile.observatory && !tile.siegeOutpost && !tile.economicStructure;

const structureVisibleOnTile = (
  structureType: "FORT" | "SIEGE_OUTPOST" | EconomicStructureType,
  playerId: string,
  tile: StructurePlannerTile,
  tilesByKey: TileLookup
): boolean =>
  structureShowsOnTile(structureType, {
    ownershipState: tile.ownershipState,
    resource: tile.resource,
    dockId: tile.dockId,
    townPopulationTier: tile.town?.populationTier,
    supportedTownCount: supportedTownCount(playerId, tile, tilesByKey),
    supportedDockCount: supportedDockCount(playerId, tile, tilesByKey)
  });

const playerTechSet = (player: StructurePlannerPlayer): ReadonlySet<string> => new Set(player.techIds ?? []);

const canAffordGold = (player: StructurePlannerPlayer, goldCost: number): boolean => player.points >= goldCost;

const canAffordStructure = (
  player: StructurePlannerPlayer,
  structureType: EconomicStructureType,
  existingOwnedCount: number
): boolean => {
  const techs = playerTechSet(player);
  const requiredTech: Partial<Record<EconomicStructureType, string>> = {
    FARMSTEAD: "agriculture",
    CAMP: "leatherworking",
    MINE: "mining",
    MARKET: "trade",
    GRANARY: "pottery",
    BANK: "coinage"
  };
  const requiredTechId = requiredTech[structureType];
  if (requiredTechId && !techs.has(requiredTechId)) return false;
  if (!canAffordGold(player, structureBuildGoldCost(structureType, existingOwnedCount))) return false;
  const resourceCost = structureCostDefinition(structureType).resourceCost;
  if (!resourceCost) return true;
  return resourceStock(player, resourceCost.resource) >= resourceCost.amount;
};

const foodCoverageLow = (player: StructurePlannerPlayer): boolean =>
  resourceStock(player, "FOOD") <= Math.max(24, (player.townCount ?? 0) * 12);

const economyWeak = (player: StructurePlannerPlayer): boolean =>
  (player.incomePerMinute ?? 0) < Math.max(3, (player.settledTileCount ?? 0) * 0.45);

export const chooseBestEconomicBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup
): { tile: StructurePlannerTile; structureType: EconomicStructureType } | undefined => {
  let best: { tile: StructurePlannerTile; structureType: EconomicStructureType; score: number } | undefined;
  const foodLow = foodCoverageLow(player);
  const econWeak = economyWeak(player);
  for (const tile of ownedTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!tileOpenForStructure(tile)) continue;
    const candidates: Array<{ type: EconomicStructureType; score: number }> = [];
    if (tile.resource === "FARM" || tile.resource === "FISH") {
      candidates.push({ type: "FARMSTEAD", score: foodLow ? 190 : 70 });
      candidates.push({ type: "GRANARY", score: foodLow ? 140 : 32 });
    } else if (tile.resource === "WOOD" || tile.resource === "FUR") {
      candidates.push({ type: "CAMP", score: econWeak ? 58 : 42 });
      candidates.push({ type: "MARKET", score: 24 });
    } else if (tile.resource === "IRON" || tile.resource === "GEMS") {
      candidates.push({ type: "MINE", score: econWeak ? 62 : 46 });
      candidates.push({ type: "MARKET", score: 22 });
    } else if (tile.town) {
      candidates.push({ type: foodLow ? "GRANARY" : "MARKET", score: foodLow ? 160 : 54 });
      candidates.push({ type: "BANK", score: econWeak ? 30 : 66 });
      candidates.push({ type: "GRANARY", score: foodLow ? 132 : 20 });
    }
    for (const candidate of candidates) {
      const existingOwnedCount = ownedStructureCount(player.id, ownedTiles, candidate.type);
      if (!canAffordStructure(player, candidate.type, existingOwnedCount)) continue;
      if (!structureVisibleOnTile(candidate.type, player.id, tile, tilesByKey)) continue;
      const next = { tile, structureType: candidate.type, score: candidate.score };
      if (!best || next.score > best.score) best = next;
    }
  }
  return best ? { tile: best.tile, structureType: best.structureType } : undefined;
};

export const chooseBestFortBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup
): StructurePlannerTile | undefined => {
  if (!playerTechSet(player).has("masonry")) return undefined;
  if (resourceStock(player, "IRON") < 45) return undefined;
  if (!canAffordGold(player, structureBuildGoldCost("FORT", ownedStructureCount(player.id, ownedTiles, "FORT")))) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of ownedTiles) {
    if (tile.ownerId !== player.id || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") continue;
    if (!tileOpenForStructure(tile)) continue;
    if (!structureVisibleOnTile("FORT", player.id, tile, tilesByKey)) continue;
    const adjacentLandCount = frontierNeighborKeys(tile.x, tile.y).reduce(
      (count, neighborKey) => count + (tilesByKey.get(neighborKey)?.terrain === "LAND" ? 1 : 0),
      0
    );
    const hostileAdjacency = frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => {
      const neighbor = tilesByKey.get(neighborKey);
      return count + (neighbor?.terrain === "LAND" && neighbor.ownerId && neighbor.ownerId !== player.id ? 1 : 0);
    }, 0);
    const neutralAdjacency = frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => {
      const neighbor = tilesByKey.get(neighborKey);
      return count + (neighbor?.terrain === "LAND" && !neighbor.ownerId ? 1 : 0);
    }, 0);
    let score = 0;
    if (tile.town) score += 140;
    if (tile.dockId) score += 120;
    if (tile.resource) score += 80;
    if (adjacentLandCount <= 3) score += 70;
    if (tile.dockId && adjacentLandCount <= 3) score += 110;
    score += hostileAdjacency * 24 + neutralAdjacency * (tile.dockId ? 10 : 4);
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 70 ? best.tile : undefined;
};

export const chooseBestSiegeOutpostBuild = (
  player: StructurePlannerPlayer,
  ownedTiles: readonly StructurePlannerTile[],
  tilesByKey: TileLookup
): StructurePlannerTile | undefined => {
  if (!playerTechSet(player).has("leatherworking")) return undefined;
  if (resourceStock(player, "SUPPLY") < 45) return undefined;
  if (!canAffordGold(player, structureBuildGoldCost("SIEGE_OUTPOST", ownedStructureCount(player.id, ownedTiles, "SIEGE_OUTPOST")))) return undefined;

  let best: { tile: StructurePlannerTile; score: number } | undefined;
  for (const tile of ownedTiles) {
    if (tile.ownerId !== player.id || tile.terrain !== "LAND") continue;
    if (tile.fort || tile.observatory || tile.siegeOutpost || tile.economicStructure) continue;
    if (!structureVisibleOnTile("SIEGE_OUTPOST", player.id, tile, tilesByKey)) continue;
    let hostileAdjacency = 0;
    let townPressure = 0;
    let economicPressure = 0;
    for (const neighborKey of frontierNeighborKeys(tile.x, tile.y)) {
      const neighbor = tilesByKey.get(neighborKey);
      if (!neighbor || neighbor.terrain !== "LAND" || !neighbor.ownerId || neighbor.ownerId === player.id) continue;
      hostileAdjacency += 1;
      if (neighbor.town) townPressure += 1;
      if (neighbor.dockId || neighbor.resource || neighbor.economicStructure) economicPressure += 1;
    }
    if (hostileAdjacency <= 0) continue;
    let score = hostileAdjacency * 120 + townPressure * 140 + economicPressure * 90;
    if (tile.town) score += 50;
    if (tile.dockId) score += 70;
    if (!best || score > best.score) best = { tile, score };
  }
  return best && best.score >= 180 ? best.tile : undefined;
};
