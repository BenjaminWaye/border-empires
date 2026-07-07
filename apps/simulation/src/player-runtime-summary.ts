import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";

type StrategicResourceKey = DomainStrategicResourceKey;
type TownPopulationTier = NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]>;

type EconomyTileLike = {
  ownerId?: string | undefined;
  ownershipState?: DomainTileState["ownershipState"] | string | undefined;
  resource?: DomainTileState["resource"] | string | undefined;
  dockId?: string | undefined;
  town?: DomainTileState["town"] | undefined;
  townType?: string | undefined;
  townName?: string | undefined;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" | undefined;
};

export type PendingSettlementRecord = {
  ownerId: string;
  tileKey: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
};

export type PlayerRuntimeSummary = {
  territoryTileKeys: Set<string>;
  frontierTileKeys: Set<string>;
  hotFrontierTileKeys: Set<string>;
  strategicFrontierTileKeys: Set<string>;
  buildCandidateTileKeys: Set<string>;
  settledTileCount: number;
  townCount: number;
  ownedTownTierByTile: Map<string, TownPopulationTier>;
  goldIncomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  activeDevelopmentProcessCount: number;
  pendingSettlementsByTile: Map<string, PendingSettlementRecord>;
  fishFoodPerMinute: number;
  synthesizerCapBonus: { IRON: number; CRYSTAL: number; SUPPLY: number };
  lastActiveAtMs: number;
};

const emptyStrategicProduction = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0
});

const strategicProductionPerMinuteForResource = (resource: DomainTileState["resource"] | string | undefined): number => {
  switch (resource) {
    case "FARM":
      return 48 / 1440;
    case "FISH":
      return 72 / 1440;
    case "IRON":
      return 60 / 1440;
    case "WOOD":
      return 60 / 1440;
    case "FUR":
      return 60 / 1440;
    case "GEMS":
      return 36 / 1440;
    default:
      return 0;
  }
};

const strategicResourceForTile = (resource: DomainTileState["resource"] | string | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    case "IRON":
      return "IRON";
    case "GEMS":
      return "CRYSTAL";
    case "WOOD":
    case "FUR":
      return "SUPPLY";
    default:
      return undefined;
  }
};

const townGoldPerMinute = (
  populationTier: NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]> | undefined
): number => {
  if (populationTier === "SETTLEMENT" || populationTier === undefined) return 1;
  if (populationTier === "CITY") return 3;
  if (populationTier === "GREAT_CITY") return 5;
  if (populationTier === "METROPOLIS") return 6.4;
  return 2;
};

const townPopulationTierForTile = (tile: EconomyTileLike): NonNullable<NonNullable<DomainTileState["town"]>["populationTier"]> | undefined =>
  tile.town?.populationTier ?? tile.townPopulationTier;

const hasTownOnTile = (tile: EconomyTileLike): boolean => Boolean(tile.town || tile.townType);

const goldIncomePerMinuteForTile = (tile: EconomyTileLike): number => {
  if (tile.ownershipState !== "SETTLED") return 0;
  if (hasTownOnTile(tile)) return townGoldPerMinute(townPopulationTierForTile(tile));
  if (tile.dockId) return 0.5;
  return 0;
};

const activeStructureProcessCount = (tile: DomainTileState, ownerId: string): number => {
  let count = 0;
  if (tile.fort?.ownerId === ownerId && (tile.fort.status === "under_construction" || tile.fort.status === "removing")) count += 1;
  if (
    tile.observatory?.ownerId === ownerId &&
    (tile.observatory.status === "under_construction" || tile.observatory.status === "removing")
  ) {
    count += 1;
  }
  if (
    tile.siegeOutpost?.ownerId === ownerId &&
    (tile.siegeOutpost.status === "under_construction" || tile.siegeOutpost.status === "removing")
  ) {
    count += 1;
  }
  if (
    tile.economicStructure?.ownerId === ownerId &&
    (tile.economicStructure.status === "under_construction" || tile.economicStructure.status === "removing")
  ) {
    count += 1;
  }
  return count;
};

export const createEmptyPlayerRuntimeSummary = (): PlayerRuntimeSummary => ({
  territoryTileKeys: new Set<string>(),
  frontierTileKeys: new Set<string>(),
  hotFrontierTileKeys: new Set<string>(),
  strategicFrontierTileKeys: new Set<string>(),
  buildCandidateTileKeys: new Set<string>(),
  settledTileCount: 0,
  townCount: 0,
  ownedTownTierByTile: new Map<string, TownPopulationTier>(),
  goldIncomePerMinute: 0,
  strategicProductionPerMinute: emptyStrategicProduction(),
  activeDevelopmentProcessCount: 0,
  pendingSettlementsByTile: new Map<string, PendingSettlementRecord>(),
  fishFoodPerMinute: 0,
  synthesizerCapBonus: { IRON: 0, CRYSTAL: 0, SUPPLY: 0 },
  lastActiveAtMs: 0
});

export const cloneStrategicProduction = (
  value: Record<StrategicResourceKey, number>
): Record<StrategicResourceKey, number> => ({
  FOOD: value.FOOD,
  IRON: value.IRON,
  CRYSTAL: value.CRYSTAL,
  SUPPLY: value.SUPPLY,
  SHARD: value.SHARD
});

export const estimateIncomePerMinuteFromTiles = (playerId: string, tiles: Iterable<EconomyTileLike>): number => {
  let income = 0;
  for (const tile of tiles) {
    if (tile.ownerId !== playerId) continue;
    income += goldIncomePerMinuteForTile(tile);
  }
  return Math.round(income * 100) / 100;
};

export const estimateStrategicProductionPerMinuteFromTiles = (
  playerId: string,
  tiles: Iterable<Pick<EconomyTileLike, "ownerId" | "ownershipState" | "resource">>
): Record<StrategicResourceKey, number> => {
  const production = emptyStrategicProduction();
  for (const tile of tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    const resourceKey = strategicResourceForTile(tile.resource);
    if (!resourceKey) continue;
    production[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
  }
  return production;
};

export const applyTileToPlayerSummary = (
  summary: PlayerRuntimeSummary,
  tileKey: string,
  tile: DomainTileState
): void => {
  if (!tile.ownerId) return;
  summary.territoryTileKeys.add(tileKey);
  if (tile.ownershipState === "FRONTIER") summary.frontierTileKeys.add(tileKey);
  if (tile.ownershipState === "SETTLED") {
    summary.settledTileCount += 1;
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) summary.strategicProductionPerMinute[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    // Track fish food separately — fish tiles fill the food cap but don't extend it
    if (tile.resource === "FISH") {
      summary.fishFoodPerMinute += 72 / 1440;
    }
  }
  if (tile.ownershipState === "SETTLED" && hasTownOnTile(tile)) {
    summary.townCount += 1;
    const tier = townPopulationTierForTile(tile) ?? "SETTLEMENT";
    summary.ownedTownTierByTile.set(tileKey, tier);
  }
  summary.goldIncomePerMinute += goldIncomePerMinuteForTile(tile);
  summary.activeDevelopmentProcessCount += activeStructureProcessCount(tile, tile.ownerId);
  // Track synthesizer cap bonuses from active economic structures
  if (tile.economicStructure?.status === "active") {
    const structureType = tile.economicStructure.type;
    if (structureType === "IRONWORKS") {
      summary.synthesizerCapBonus.IRON += 30;
    } else if (structureType === "ADVANCED_IRONWORKS") {
      summary.synthesizerCapBonus.IRON += 45;
    } else if (structureType === "CRYSTAL_SYNTHESIZER") {
      summary.synthesizerCapBonus.CRYSTAL += 18;
    } else if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") {
      summary.synthesizerCapBonus.CRYSTAL += 27;
    } else if (structureType === "FUR_SYNTHESIZER") {
      summary.synthesizerCapBonus.SUPPLY += 30;
    } else if (structureType === "ADVANCED_FUR_SYNTHESIZER") {
      summary.synthesizerCapBonus.SUPPLY += 45;
    }
  }
};

export const removeTileFromPlayerSummary = (
  summary: PlayerRuntimeSummary,
  tileKey: string,
  tile: DomainTileState
): void => {
  if (!tile.ownerId) return;
  summary.territoryTileKeys.delete(tileKey);
  summary.frontierTileKeys.delete(tileKey);
  if (tile.ownershipState === "SETTLED") {
    summary.settledTileCount = Math.max(0, summary.settledTileCount - 1);
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) {
      summary.strategicProductionPerMinute[resourceKey] = Math.max(
        0,
        summary.strategicProductionPerMinute[resourceKey] - strategicProductionPerMinuteForResource(tile.resource)
      );
    }
    if (tile.resource === "FISH") {
      summary.fishFoodPerMinute = Math.max(0, summary.fishFoodPerMinute - 72 / 1440);
    }
  }
  if (tile.ownershipState === "SETTLED" && hasTownOnTile(tile)) {
    summary.townCount = Math.max(0, summary.townCount - 1);
    summary.ownedTownTierByTile.delete(tileKey);
  }
  summary.goldIncomePerMinute = Math.max(0, summary.goldIncomePerMinute - goldIncomePerMinuteForTile(tile));
  summary.activeDevelopmentProcessCount = Math.max(0, summary.activeDevelopmentProcessCount - activeStructureProcessCount(tile, tile.ownerId));
  // Mirror synthesizer cap bonus subtractions
  if (tile.economicStructure?.status === "active") {
    const structureType = tile.economicStructure.type;
    if (structureType === "IRONWORKS") {
      summary.synthesizerCapBonus.IRON = Math.max(0, summary.synthesizerCapBonus.IRON - 30);
    } else if (structureType === "ADVANCED_IRONWORKS") {
      summary.synthesizerCapBonus.IRON = Math.max(0, summary.synthesizerCapBonus.IRON - 45);
    } else if (structureType === "CRYSTAL_SYNTHESIZER") {
      summary.synthesizerCapBonus.CRYSTAL = Math.max(0, summary.synthesizerCapBonus.CRYSTAL - 18);
    } else if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") {
      summary.synthesizerCapBonus.CRYSTAL = Math.max(0, summary.synthesizerCapBonus.CRYSTAL - 27);
    } else if (structureType === "FUR_SYNTHESIZER") {
      summary.synthesizerCapBonus.SUPPLY = Math.max(0, summary.synthesizerCapBonus.SUPPLY - 30);
    } else if (structureType === "ADVANCED_FUR_SYNTHESIZER") {
      summary.synthesizerCapBonus.SUPPLY = Math.max(0, summary.synthesizerCapBonus.SUPPLY - 45);
    }
  }
};

export const addPendingSettlementToSummary = (
  summary: PlayerRuntimeSummary,
  settlement: PendingSettlementRecord
): void => {
  summary.pendingSettlementsByTile.set(settlement.tileKey, settlement);
  summary.activeDevelopmentProcessCount += 1;
};

export const removePendingSettlementFromSummary = (
  summary: PlayerRuntimeSummary,
  tileKey: string
): void => {
  if (!summary.pendingSettlementsByTile.has(tileKey)) return;
  summary.pendingSettlementsByTile.delete(tileKey);
  summary.activeDevelopmentProcessCount = Math.max(0, summary.activeDevelopmentProcessCount - 1);
};
