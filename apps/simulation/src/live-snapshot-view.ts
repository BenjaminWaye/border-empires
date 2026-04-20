import { OBSERVATORY_UPKEEP_PER_MIN, type Tile } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

import {
  AIRPORT_OIL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  DOCK_INCOME_PER_MIN,
  FARMSTEAD_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  FUEL_PLANT_GOLD_UPKEEP,
  FUEL_PLANT_OIL_PER_DAY,
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
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  RADAR_SYSTEM_GOLD_UPKEEP,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";
import { buildTileYieldView } from "./tile-yield-view.js";

type RuntimeState = {
  tiles: Array<{
    x: number;
    y: number;
    terrain?: "LAND" | "SEA" | "MOUNTAIN";
    resource?: string;
    dockId?: string;
    ownerId?: string;
    ownershipState?: string;
    townJson?: string;
    townType?: "MARKET" | "FARMING";
    townName?: string;
    townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    fortJson?: string;
    observatoryJson?: string;
    siegeOutpostJson?: string;
    economicStructureJson?: string;
    sabotageJson?: string;
    shardSiteJson?: string;
  }>;
  players: Array<{
    id: string;
    name?: string;
    points: number;
    manpower: number;
    manpowerCapSnapshot?: number;
    techIds: string[];
    domainIds: string[];
    strategicResources: Partial<Record<StrategicResourceKey, number>>;
    allies: string[];
    vision: number;
    visionRadiusBonus: number;
    territoryTileKeys: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    incomeMultiplier?: number;
    strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
  activeDevelopmentProcessCount?: number;
  }>;
  tileYieldCollectedAtByTile?: Array<{ tileKey: string; collectedAt: number }>;
};

type StrategicResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";
type EconomyResourceKey = StrategicResourceKey | "GOLD";
type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  resourceKey?: EconomyResourceKey;
  note?: string;
};
type EconomyBreakdown = Record<EconomyResourceKey, { sources: EconomyBucket[]; sinks: EconomyBucket[] }>;
type UpkeepPerMinute = { food: number; iron: number; supply: number; crystal: number; oil: number; gold: number };
type UpkeepLastTick = {
  foodCoverage: number;
  gold: { contributors: EconomyBucket[] };
  food: { contributors: EconomyBucket[] };
  iron: { contributors: EconomyBucket[] };
  crystal: { contributors: EconomyBucket[] };
  supply: { contributors: EconomyBucket[] };
  oil: { contributors: EconomyBucket[] };
};
type LivePlayerEconomySnapshot = {
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
  fedTownKeys: Set<string>;
};

const keyFor = (x: number, y: number): string => `${x},${y}`;

const parseTown = (tile: RuntimeState["tiles"][number]): Partial<NonNullable<Tile["town"]>> | undefined => {
  if (tile.townJson) {
    try {
      return JSON.parse(tile.townJson) as Partial<NonNullable<Tile["town"]>>;
    } catch {
      return undefined;
    }
  }
  if (!tile.townType) return undefined;
  return {
    ...(tile.townName ? { name: tile.townName } : {}),
    type: tile.townType,
    populationTier: tile.townPopulationTier ?? "SETTLEMENT"
  };
};

const parseStructure = <T>(json: string | undefined): T | undefined => {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

const emptyStrategic = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0,
  OIL: 0
});

const addBucket = (
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

const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()]
    .map((bucket) => ({ ...bucket, amountPerMinute: Number(bucket.amountPerMinute.toFixed(4)) }))
    .sort((left, right) => right.amountPerMinute - left.amountPerMinute || left.label.localeCompare(right.label));

const townFoodUpkeepPerMinute = (populationTier: string | undefined): number => {
  if (populationTier === "SETTLEMENT" || !populationTier) return 0;
  if (populationTier === "CITY") return 0.2;
  if (populationTier === "GREAT_CITY") return 0.4;
  if (populationTier === "METROPOLIS") return 0.8;
  return 0.1;
};

const townPopulationMultiplier = (populationTier: string | undefined): number => {
  if (populationTier === "SETTLEMENT" || !populationTier) return 0.6;
  if (populationTier === "CITY") return 1.5;
  if (populationTier === "GREAT_CITY") return 2.5;
  if (populationTier === "METROPOLIS") return 3.2;
  return 1;
};

const strategicProductionPerMinuteForResource = (resource: string | undefined): number => {
  switch (resource) {
    case "FARM":
      return 72 / 1440;
    case "FISH":
      return 48 / 1440;
    case "IRON":
      return 60 / 1440;
    case "WOOD":
    case "FUR":
      return 60 / 1440;
    case "GEMS":
      return 36 / 1440;
    case "OIL":
      return 48 / 1440;
    default:
      return 0;
  }
};

const strategicResourceForTile = (resource: string | undefined): StrategicResourceKey | undefined => {
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
    case "OIL":
      return "OIL";
    default:
      return undefined;
  }
};

const structureUpkeepPerMinute = (structureType: string): Partial<Record<EconomyResourceKey, number>> => {
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
    case "FUEL_PLANT": return { GOLD: FUEL_PLANT_GOLD_UPKEEP / 10 };
    case "FOUNDRY": return { GOLD: FOUNDRY_GOLD_UPKEEP / 10 };
    case "CUSTOMS_HOUSE": return { GOLD: CUSTOMS_HOUSE_GOLD_UPKEEP / 10 };
    case "GARRISON_HALL": return { GOLD: GARRISON_HALL_GOLD_UPKEEP / 10 };
    case "GOVERNORS_OFFICE": return { GOLD: GOVERNORS_OFFICE_GOLD_UPKEEP / 10 };
    case "RADAR_SYSTEM": return { GOLD: RADAR_SYSTEM_GOLD_UPKEEP / 10 };
    case "AIRPORT": return { OIL: AIRPORT_OIL_UPKEEP_PER_MIN };
    default: return {};
  }
};

const converterOutputPerMinute = (structureType: string): Partial<Record<StrategicResourceKey, number>> => {
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
    case "FUEL_PLANT":
      return { OIL: FUEL_PLANT_OIL_PER_DAY / 1440 };
    default:
      return {};
  }
};

const supportSummaryForTown = (
  tileKey: string,
  ownerId: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
): { supportCurrent: number; supportMax: number } => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!tile || tile.terrain !== "LAND") continue;
      supportMax += 1;
      if (tile.ownerId === ownerId && tile.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const hasSupportedStructure = (
  tileKey: string,
  ownerId: string,
  structureType: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
): boolean => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
      if (structure?.status === "active" && structure.type === structureType) return true;
    }
  }
  return false;
};

const buildFedTownKeysByPlayer = (
  runtimeState: RuntimeState,
  strategicProductionByPlayer: ReadonlyMap<string, Record<StrategicResourceKey, number>>
): Map<string, Set<string>> => {
  const tilesByKey = new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const result = new Map<string, Set<string>>();
  for (const player of runtimeState.players) {
    const availableFood =
      (player.strategicResources?.FOOD ?? 0) + (strategicProductionByPlayer.get(player.id)?.FOOD ?? 0);
    let remainingFood = availableFood;
    const fedTownKeys = new Set<string>();
    const ownedSettledTowns = runtimeState.tiles
      .filter((tile) => tile.ownerId === player.id && tile.ownershipState === "SETTLED" && (tile.townJson || tile.townType))
      .sort((left, right) => (left.x - right.x) || (left.y - right.y));
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
  return result;
};

const buildStrategicProductionByPlayer = (runtimeState: RuntimeState): Map<string, Record<StrategicResourceKey, number>> => {
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
  return production;
};

const buildTownSummary = (
  tile: RuntimeState["tiles"][number],
  player: RuntimeState["players"][number] | undefined,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  fedTownKeys: ReadonlySet<string>
): Tile["town"] | undefined => {
  const partial = parseTown(tile);
  if (!partial || !tile.townType) return undefined;
  const tileKey = keyFor(tile.x, tile.y);
  const populationTier = partial.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const isSettlement = populationTier === "SETTLEMENT";
  const support = tile.ownerId && tile.ownershipState === "SETTLED" && !isSettlement
    ? supportSummaryForTown(tileKey, tile.ownerId, tilesByKey)
    : { supportCurrent: 0, supportMax: 0 };
  const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
  const isFed = tile.ownerId ? fedTownKeys.has(tileKey) : false;
  const hasMarket = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "MARKET", tilesByKey));
  const hasGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "GRANARY", tilesByKey));
  const hasBank = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "BANK", tilesByKey));
  const incomeMultiplier = player?.incomeMultiplier ?? 1;
  const baseGoldPerMinute = isSettlement ? SETTLEMENT_BASE_GOLD_PER_MIN : TOWN_BASE_GOLD_PER_MIN;
  const goldPerMinute =
    !tile.ownerId || tile.ownershipState !== "SETTLED"
      ? 0
      : isSettlement
        ? baseGoldPerMinute * incomeMultiplier * PASSIVE_INCOME_MULT
        : !isFed
          ? 0
          : (
              TOWN_BASE_GOLD_PER_MIN *
              supportRatio *
              townPopulationMultiplier(populationTier) *
              (1 + (partial.connectedTownBonus ?? 0)) *
              (hasMarket ? 1.5 : 1) *
              (hasBank ? 1.5 : 1) *
              incomeMultiplier *
              PASSIVE_INCOME_MULT
            ) + (hasBank ? 1 : 0);
  const population = typeof partial.population === "number" ? partial.population : 1;
  const maxPopulation = typeof partial.maxPopulation === "number" ? partial.maxPopulation : 3;
  const logisticFactor = 1 - population / Math.max(1, maxPopulation);
  const baseGrowth =
    !tile.ownerId || tile.ownershipState !== "SETTLED" || !isFed || logisticFactor <= 0
      ? 0
      : population *
        POPULATION_GROWTH_BASE_RATE *
        (populationTier === "SETTLEMENT" ? 4 : 1) *
        (hasGranary ? 1.15 : 1) *
        logisticFactor;
  const growthModifiers = baseGrowth > 0 ? [{ label: "Long time peace" as const, deltaPerMinute: Number(baseGrowth.toFixed(4)) }] : [];
  const cap = isSettlement
    ? goldPerMinute * 60 * 8
    : goldPerMinute * 60 * 8 * (hasMarket ? 1.5 : 1);
  return {
    ...(partial.name ? { name: partial.name } : {}),
    type: tile.townType,
    baseGoldPerMinute: Number(baseGoldPerMinute.toFixed(4)),
    supportCurrent: support.supportCurrent,
    supportMax: support.supportMax,
    goldPerMinute: Number(goldPerMinute.toFixed(4)),
    cap: Number(cap.toFixed(4)),
    isFed,
    population,
    maxPopulation,
    populationGrowthPerMinute: Number(baseGrowth.toFixed(4)),
    populationTier,
    connectedTownCount: typeof partial.connectedTownCount === "number" ? partial.connectedTownCount : 0,
    connectedTownBonus: typeof partial.connectedTownBonus === "number" ? partial.connectedTownBonus : 0,
    ...(Array.isArray(partial.connectedTownNames) ? { connectedTownNames: partial.connectedTownNames } : {}),
    hasMarket,
    marketActive: hasMarket && isFed,
    hasGranary,
    granaryActive: hasGranary,
    hasBank,
    bankActive: hasBank,
    foodUpkeepPerMinute: townFoodUpkeepPerMinute(populationTier),
    ...(growthModifiers.length > 0 ? { growthModifiers } : {})
  };
};

export const buildLivePlayerEconomySnapshot = (
  playerId: string,
  runtimeState: RuntimeState
): LivePlayerEconomySnapshot => {
  const tilesByKey = new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeys = buildFedTownKeysByPlayer(runtimeState, strategicProductionByPlayer).get(playerId) ?? new Set<string>();
  const goldSources = new Map<string, EconomyBucket>();
  const goldSinks = new Map<string, EconomyBucket>();
  const foodSources = new Map<string, EconomyBucket>();
  const foodSinks = new Map<string, EconomyBucket>();
  const ironSources = new Map<string, EconomyBucket>();
  const ironSinks = new Map<string, EconomyBucket>();
  const crystalSources = new Map<string, EconomyBucket>();
  const crystalSinks = new Map<string, EconomyBucket>();
  const supplySources = new Map<string, EconomyBucket>();
  const supplySinks = new Map<string, EconomyBucket>();
  const shardSources = new Map<string, EconomyBucket>();
  const oilSources = new Map<string, EconomyBucket>();
  const oilSinks = new Map<string, EconomyBucket>();
  const strategicProductionPerMinute = strategicProductionByPlayer.get(playerId) ?? emptyStrategic();

  for (const tile of runtimeState.tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    addBucket(goldSinks, "Settled land upkeep", 0.04, { count: 1, note: "1 settled tile" });
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "IRON" ? ironSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        resourceKey === "SUPPLY" ? supplySources :
        oilSources;
      addBucket(target, tile.resource === "FARM" ? "Grain" : tile.resource === "FISH" ? "Fish" : tile.resource === "IRON" ? "Iron" : tile.resource === "GEMS" ? "Crystal" : tile.resource === "OIL" ? "Oil" : "Supply", resourceRate, { count: 1, resourceKey });
    }
    const town = buildTownSummary(tile, player, tilesByKey, fedTownKeys);
    if (town && town.goldPerMinute > 0) addBucket(goldSources, "Towns", town.goldPerMinute, { count: 1 });
    if (town && (town.foodUpkeepPerMinute ?? 0) > 0) addBucket(foodSinks, "Town", town.foodUpkeepPerMinute ?? 0, { count: 1 });
    if (tile.dockId) addBucket(goldSources, "Docks", DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT, { count: 1 });
    const fort = parseStructure<{ status?: string }>(tile.fortJson);
    if (fort?.status === "active") {
      addBucket(goldSinks, "Fort", 1, { count: 1 });
      addBucket(ironSinks, "Fort", 0.025, { count: 1 });
    }
    const siegeOutpost = parseStructure<{ status?: string }>(tile.siegeOutpostJson);
    if (siegeOutpost?.status === "active") {
      addBucket(goldSinks, "Siege outpost", 1, { count: 1 });
      addBucket(supplySinks, "Siege outpost", 0.025, { count: 1 });
    }
    const observatory = parseStructure<{ status?: string }>(tile.observatoryJson);
    if (observatory?.status === "active") addBucket(crystalSinks, "Observatory", OBSERVATORY_UPKEEP_PER_MIN, { count: 1 });
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const upkeep = structureUpkeepPerMinute(structure.type);
      if (upkeep.GOLD) addBucket(goldSinks, structure.type, upkeep.GOLD, { count: 1 });
      if (upkeep.FOOD) addBucket(foodSinks, structure.type, upkeep.FOOD, { count: 1 });
      if (upkeep.CRYSTAL) addBucket(crystalSinks, structure.type, upkeep.CRYSTAL, { count: 1 });
      if (upkeep.OIL) addBucket(oilSinks, structure.type, upkeep.OIL, { count: 1 });
      const output = converterOutputPerMinute(structure.type);
      if (output.IRON) addBucket(ironSources, structure.type, output.IRON, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.SUPPLY) addBucket(supplySources, structure.type, output.SUPPLY, { count: 1 });
      if (output.OIL) addBucket(oilSources, structure.type, output.OIL, { count: 1 });
    }
  }

  const upkeepPerMinute = {
    food: Number([...foodSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    iron: Number([...ironSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    supply: Number([...supplySinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    crystal: Number([...crystalSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    oil: Number([...oilSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    gold: Number([...goldSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4))
  };
  const incomePerMinute = Number([...goldSources.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4));
  const foodCoverage =
    upkeepPerMinute.food <= 0
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            (((player?.strategicResources.FOOD ?? 0) + strategicProductionPerMinute.FOOD) / upkeepPerMinute.food)
          )
        );
  return {
    incomePerMinute,
    strategicProductionPerMinute: {
      FOOD: Number(strategicProductionPerMinute.FOOD.toFixed(4)),
      IRON: Number(strategicProductionPerMinute.IRON.toFixed(4)),
      CRYSTAL: Number(strategicProductionPerMinute.CRYSTAL.toFixed(4)),
      SUPPLY: Number(strategicProductionPerMinute.SUPPLY.toFixed(4)),
      SHARD: Number(strategicProductionPerMinute.SHARD.toFixed(4)),
      OIL: Number(strategicProductionPerMinute.OIL.toFixed(4))
    },
    upkeepPerMinute,
    upkeepLastTick: {
      foodCoverage: Number(foodCoverage.toFixed(4)),
      gold: { contributors: sortedBuckets(goldSinks) },
      food: { contributors: sortedBuckets(foodSinks) },
      iron: { contributors: sortedBuckets(ironSinks) },
      crystal: { contributors: sortedBuckets(crystalSinks) },
      supply: { contributors: sortedBuckets(supplySinks) },
      oil: { contributors: sortedBuckets(oilSinks) }
    },
    economyBreakdown: {
      GOLD: { sources: sortedBuckets(goldSources), sinks: sortedBuckets(goldSinks) },
      FOOD: { sources: sortedBuckets(foodSources), sinks: sortedBuckets(foodSinks) },
      IRON: { sources: sortedBuckets(ironSources), sinks: sortedBuckets(ironSinks) },
      CRYSTAL: { sources: sortedBuckets(crystalSources), sinks: sortedBuckets(crystalSinks) },
      SUPPLY: { sources: sortedBuckets(supplySources), sinks: sortedBuckets(supplySinks) },
      SHARD: { sources: sortedBuckets(shardSources), sinks: [] },
      OIL: { sources: sortedBuckets(oilSources), sinks: sortedBuckets(oilSinks) }
    },
    fedTownKeys
  };
};

export const enrichSnapshotTilesForPlayer = (
  playerId: string,
  runtimeState: RuntimeState,
  visibleTiles: RuntimeState["tiles"],
  playerEconomy: LivePlayerEconomySnapshot
): RuntimeState["tiles"] => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  return visibleTiles.map((tile) => {
    const player = runtimeState.players.find((entry) => entry.id === tile.ownerId);
    const town = buildTownSummary(tile, player, tilesByKey, tile.ownerId === playerId ? playerEconomy.fedTownKeys : new Set<string>());
    const yieldTile: DomainTileState = {
      x: tile.x,
      y: tile.y,
      terrain: tile.terrain ?? "LAND",
      ...(tile.resource ? { resource: tile.resource as DomainTileState["resource"] } : {}),
      ...(tile.dockId ? { dockId: tile.dockId } : {}),
      ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
      ...(tile.ownershipState ? { ownershipState: tile.ownershipState as DomainTileState["ownershipState"] } : {}),
      ...(town ? { town } : tile.townJson ? { town: JSON.parse(tile.townJson) as DomainTileState["town"] } : {}),
      ...(tile.economicStructureJson ? { economicStructure: JSON.parse(tile.economicStructureJson) as DomainTileState["economicStructure"] } : {})
    };
    const yieldView = buildTileYieldView(yieldTile, collectedAtByTile.get(keyFor(tile.x, tile.y)), Date.now());
    const yieldFields = {
      ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
      ...(yieldView?.yieldRate ? { yieldRate: yieldView.yieldRate } : {}),
      ...(yieldView?.yieldCap ? { yieldCap: yieldView.yieldCap } : {})
    };
    if (!town) return { ...tile, ...yieldFields };
    return {
      ...tile,
      townJson: JSON.stringify(town),
      townType: town.type,
      ...(town.name ? { townName: town.name } : {}),
      townPopulationTier: town.populationTier,
      ...yieldFields
    };
  });
};
