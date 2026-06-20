import {
  AIRPORT_CRYSTAL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  FARMSTEAD_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP,
  IRONWORKS_IRON_PER_DAY,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  MINE_GOLD_UPKEEP,
  POPULATION_MAX,
  RADAR_SYSTEM_GOLD_UPKEEP,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";
import type { Tile } from "@border-empires/shared";
import {
  type RuntimeState,
  type StrategicResourceKey,
  type EconomyResourceKey,
  type EconomyBucket,
  keyFor,
  parseTown,
  parseStructure,
  strategicProductionByPlayerCache,
  fedTownKeysByPlayerCache
} from "./snapshot-tile-cache.js";
import { shouldYieldAt } from "./event-loop-yield.js";

export const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const SYNTHETIC_SETTLEMENT_POPULATION = 800;

const isSyntheticSettlementIdentity = (name: string | undefined, populationTier: NonNullable<Tile["town"]>["populationTier"], x: number, y: number): boolean =>
  populationTier === "SETTLEMENT" && name === `Settlement ${x},${y}`;

export const resolvedTownPopulation = (
  town: Partial<NonNullable<Tile["town"]>>,
  x: number,
  y: number,
  populationTier: NonNullable<Tile["town"]>["populationTier"]
): { population: number; maxPopulation: number } | undefined => {
  if (typeof town.population === "number" && typeof town.maxPopulation === "number") {
    return { population: town.population, maxPopulation: town.maxPopulation };
  }
  if (isSyntheticSettlementIdentity(town.name, populationTier, x, y)) {
    return { population: typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION, maxPopulation: typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX };
  }
  if (populationTier === "SETTLEMENT") {
    return { population: typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION, maxPopulation: typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX };
  }
  return undefined;
};

export const isCompleteTownSummary = (town: Partial<NonNullable<Tile["town"]>> | undefined): town is NonNullable<Tile["town"]> =>
  Boolean(
    town &&
      (town.type === "MARKET" || town.type === "FARMING") &&
      (town.populationTier === "SETTLEMENT" ||
        town.populationTier === "TOWN" ||
        town.populationTier === "CITY" ||
        town.populationTier === "GREAT_CITY" ||
        town.populationTier === "METROPOLIS") &&
      isFiniteNumber(town.baseGoldPerMinute) &&
      isFiniteNumber(town.supportCurrent) &&
      isFiniteNumber(town.supportMax) &&
      isFiniteNumber(town.goldPerMinute) &&
      isFiniteNumber(town.cap) &&
      typeof town.isFed === "boolean" &&
      isFiniteNumber(town.population) &&
      isFiniteNumber(town.maxPopulation) &&
      isFiniteNumber(town.connectedTownCount) &&
      isFiniteNumber(town.connectedTownBonus) &&
      typeof town.hasMarket === "boolean" &&
      typeof town.marketActive === "boolean" &&
      typeof town.hasGranary === "boolean" &&
      typeof town.granaryActive === "boolean" &&
      typeof town.hasBank === "boolean" &&
      typeof town.bankActive === "boolean"
  );

export const emptyStrategic = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0
});

export const addBucket = (
  target: Map<string, EconomyBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (!(amountPerMinute > 0.0001)) return;
  const existing = target.get(label);
  if (existing) {
    existing.amountPerMinute += amountPerMinute;
    existing.count += options.count ?? 1;
    if (options.note) existing.note = options.note;
    if (options.resourceKey) existing.resourceKey = options.resourceKey;
    return;
  }
  target.set(label, {
    label,
    amountPerMinute,
    count: options.count ?? 1,
    ...(options.note ? { note: options.note } : {}),
    ...(options.resourceKey ? { resourceKey: options.resourceKey } : {})
  });
};

export const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()]
    .map((bucket) => ({ ...bucket, amountPerMinute: Number(bucket.amountPerMinute.toFixed(4)) }))
    .sort((left, right) => right.amountPerMinute - left.amountPerMinute || left.label.localeCompare(right.label));

export const townFoodUpkeepPerMinute = (populationTier: string | undefined): number => {
  if (populationTier === "SETTLEMENT" || !populationTier) return 0;
  if (populationTier === "CITY") return 0.2;
  if (populationTier === "GREAT_CITY") return 0.4;
  if (populationTier === "METROPOLIS") return 0.8;
  return 0.1;
};

export const townPopulationMultiplier = (populationTier: string | undefined): number => {
  if (populationTier === "SETTLEMENT" || !populationTier) return 0.6;
  if (populationTier === "CITY") return 1.5;
  if (populationTier === "GREAT_CITY") return 2.5;
  if (populationTier === "METROPOLIS") return 3.2;
  return 1;
};

export const strategicProductionPerMinuteForResource = (resource: string | undefined): number => {
  switch (resource) {
    case "FARM": return 72 / 1440;
    case "FISH": return 48 / 1440;
    case "IRON": return 60 / 1440;
    case "WOOD":
    case "FUR": return 60 / 1440;
    case "GEMS": return 36 / 1440;
    default: return 0;
  }
};

export const strategicResourceForTile = (resource: string | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH": return "FOOD";
    case "IRON": return "IRON";
    case "GEMS": return "CRYSTAL";
    case "WOOD":
    case "FUR": return "SUPPLY";
    default: return undefined;
  }
};

export const structureUpkeepPerMinute = (structureType: string): Partial<Record<EconomyResourceKey, number>> => {
  switch (structureType) {
    case "FARMSTEAD": return { GOLD: FARMSTEAD_GOLD_UPKEEP / 10 };
    case "CAMP": return { GOLD: CAMP_GOLD_UPKEEP / 10 };
    case "MINE": return { GOLD: MINE_GOLD_UPKEEP / 10 };
    case "GRANARY": return { GOLD: GRANARY_GOLD_UPKEEP / 10 };
    case "MARKET": return { FOOD: MARKET_FOOD_UPKEEP / 10 };
    case "BANK": return { FOOD: BANK_FOOD_UPKEEP / 10 };
    case "CARAVANARY": return { FOOD: CARAVANARY_FOOD_UPKEEP / 10 };
    case "WOODEN_FORT": return { GOLD: WOODEN_FORT_GOLD_UPKEEP / 10 };
    case "LIGHT_OUTPOST": return { GOLD: LIGHT_OUTPOST_GOLD_UPKEEP / 10 };
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER": return { GOLD: FUR_SYNTHESIZER_GOLD_UPKEEP / 10 };
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS": return { GOLD: IRONWORKS_GOLD_UPKEEP / 10 };
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return { GOLD: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10 };
    case "FOUNDRY": return { GOLD: FOUNDRY_GOLD_UPKEEP / 10 };
    case "CUSTOMS_HOUSE": return { GOLD: CUSTOMS_HOUSE_GOLD_UPKEEP / 10 };
    case "GARRISON_HALL": return { GOLD: GARRISON_HALL_GOLD_UPKEEP / 10 };
    case "GOVERNORS_OFFICE": return { GOLD: GOVERNORS_OFFICE_GOLD_UPKEEP / 10 };
    case "RADAR_SYSTEM": return { GOLD: RADAR_SYSTEM_GOLD_UPKEEP / 10 };
    case "AIRPORT": return { CRYSTAL: AIRPORT_CRYSTAL_UPKEEP_PER_MIN };
    default: return {};
  }
};

export const converterOutputPerMinute = (structureType: string): Partial<Record<StrategicResourceKey, number>> => {
  switch (structureType) {
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER":
      return { SUPPLY: FUR_SYNTHESIZER_SUPPLY_PER_DAY / 1440 };
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS":
      return { IRON: IRONWORKS_IRON_PER_DAY / 1440 };
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY / 1440 };
    default:
      return {};
  }
};

export const buildStrategicProductionByPlayer = (runtimeState: RuntimeState): Map<string, Record<StrategicResourceKey, number>> => {
  const cached = strategicProductionByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const production = new Map<string, Record<StrategicResourceKey, number>>();
  for (const player of runtimeState.players) production.set(player.id, emptyStrategic());
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const target = production.get(tile.ownerId) ?? emptyStrategic();
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) target[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const output = converterOutputPerMinute(structure.type);
      for (const [resource, amount] of Object.entries(output) as Array<[StrategicResourceKey, number]>) target[resource] += amount;
    }
    production.set(tile.ownerId, target);
  }
  strategicProductionByPlayerCache.set(runtimeState, production);
  return production;
};

export const buildStrategicProductionByPlayerAsync = async (
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, Record<StrategicResourceKey, number>>> => {
  const cached = strategicProductionByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const production = new Map<string, Record<StrategicResourceKey, number>>();
  for (const player of runtimeState.players) production.set(player.id, emptyStrategic());
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const target = production.get(tile.ownerId) ?? emptyStrategic();
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) target[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const output = converterOutputPerMinute(structure.type);
      for (const [resource, amount] of Object.entries(output) as Array<[StrategicResourceKey, number]>) target[resource] += amount;
    }
    production.set(tile.ownerId, target);
  }
  strategicProductionByPlayerCache.set(runtimeState, production);
  return production;
};

export const buildFedTownKeysByPlayer = (
  runtimeState: RuntimeState,
  strategicProductionByPlayer: ReadonlyMap<string, Record<StrategicResourceKey, number>>
): Map<string, Set<string>> => {
  const cached = fedTownKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, Set<string>>();
  const ownedSettledTownsByPlayerId = new Map<string, RuntimeState["tiles"]>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(tile.ownerId) ?? [];
    ownedSettledTowns.push(tile);
    ownedSettledTownsByPlayerId.set(tile.ownerId, ownedSettledTowns);
  }
  for (const player of runtimeState.players) {
    const availableFood =
      (player.strategicResources?.FOOD ?? 0) + (strategicProductionByPlayer.get(player.id)?.FOOD ?? 0);
    let remainingFood = availableFood;
    const fedTownKeys = new Set<string>();
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(player.id) ?? [];
    ownedSettledTowns.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    for (const tile of ownedSettledTowns) {
      const town = parseTown(tile);
      const upkeep = townFoodUpkeepPerMinute(town?.populationTier);
      if (upkeep <= 0) {
        fedTownKeys.add(keyFor(tile.x, tile.y));
        continue;
      }
      if (remainingFood + 1e-9 >= upkeep) {
        fedTownKeys.add(keyFor(tile.x, tile.y));
        remainingFood = Math.max(0, remainingFood - upkeep);
      }
    }
    result.set(player.id, fedTownKeys);
  }
  fedTownKeysByPlayerCache.set(runtimeState, result);
  return result;
};

export const buildFedTownKeysByPlayerAsync = async (
  runtimeState: RuntimeState,
  strategicProductionByPlayer: ReadonlyMap<string, Record<StrategicResourceKey, number>>,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, Set<string>>> => {
  const cached = fedTownKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, Set<string>>();
  const ownedSettledTownsByPlayerId = new Map<string, RuntimeState["tiles"]>();
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(tile.ownerId) ?? [];
    ownedSettledTowns.push(tile);
    ownedSettledTownsByPlayerId.set(tile.ownerId, ownedSettledTowns);
  }
  for (const player of runtimeState.players) {
    const availableFood =
      (player.strategicResources?.FOOD ?? 0) + (strategicProductionByPlayer.get(player.id)?.FOOD ?? 0);
    let remainingFood = availableFood;
    const fedTownKeys = new Set<string>();
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(player.id) ?? [];
    ownedSettledTowns.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    for (const tile of ownedSettledTowns) {
      const town = parseTown(tile);
      const upkeep = townFoodUpkeepPerMinute(town?.populationTier);
      if (upkeep <= 0) {
        fedTownKeys.add(keyFor(tile.x, tile.y));
        continue;
      }
      if (remainingFood + 1e-9 >= upkeep) {
        fedTownKeys.add(keyFor(tile.x, tile.y));
        remainingFood = Math.max(0, remainingFood - upkeep);
      }
    }
    result.set(player.id, fedTownKeys);
  }
  fedTownKeysByPlayerCache.set(runtimeState, result);
  return result;
};
