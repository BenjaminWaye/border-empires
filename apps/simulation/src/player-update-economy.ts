import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import type { DomainPlayer, DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";

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
  RADAR_SYSTEM_GOLD_UPKEEP,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";

type StrategicResourceKey = DomainStrategicResourceKey;
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

export type PlayerUpdateEconomySnapshot = {
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
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
  buckets: Map<string, EconomyBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (!(amountPerMinute > 0)) return;
  const current = buckets.get(label);
  if (current) {
    current.amountPerMinute = Number((current.amountPerMinute + amountPerMinute).toFixed(4));
    current.count += options.count ?? 1;
    return;
  }
  buckets.set(label, {
    label,
    amountPerMinute: Number(amountPerMinute.toFixed(4)),
    count: options.count ?? 1,
    ...(options.resourceKey ? { resourceKey: options.resourceKey } : {}),
    ...(options.note ? { note: options.note } : {})
  });
};

const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()].sort((left, right) => (right.amountPerMinute - left.amountPerMinute) || left.label.localeCompare(right.label));

const strategicProductionPerMinuteForResource = (resource: DomainTileState["resource"] | undefined): number => {
  switch (resource) {
    case "FARM":
      return 72 / 1440;
    case "FISH":
      return 48 / 1440;
    case "IRON":
      return 60 / 1440;
    case "WOOD":
      return 60 / 1440;
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

const strategicResourceForTile = (resource: DomainTileState["resource"] | undefined): StrategicResourceKey | undefined => {
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

const structureUpkeepPerMinute = (structureType: string): Partial<Record<EconomyResourceKey, number>> => {
  switch (structureType) {
    case "FARMSTEAD": return { GOLD: FARMSTEAD_GOLD_UPKEEP / 10 };
    case "CAMP": return { GOLD: CAMP_GOLD_UPKEEP / 10 };
    case "MINE": return { GOLD: MINE_GOLD_UPKEEP / 10 };
    case "MARKET": return { FOOD: MARKET_FOOD_UPKEEP / 10 };
    case "GRANARY": return { GOLD: GRANARY_GOLD_UPKEEP / 10 };
    case "BANK": return { FOOD: BANK_FOOD_UPKEEP / 10 };
    case "WOODEN_FORT": return { GOLD: WOODEN_FORT_GOLD_UPKEEP / 10 };
    case "LIGHT_OUTPOST": return { GOLD: LIGHT_OUTPOST_GOLD_UPKEEP / 10 };
    case "CARAVANARY": return { FOOD: CARAVANARY_FOOD_UPKEEP / 10 };
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

const townPopulationMultiplier = (populationTier: string | undefined): number => {
  switch (populationTier) {
    case "CITY":
      return 1.5;
    case "GREAT_CITY":
      return 2.5;
    case "METROPOLIS":
      return 3.2;
    default:
      return 1;
  }
};

const townFoodUpkeepPerMinute = (populationTier: string | undefined): number => {
  switch (populationTier) {
    case "CITY":
      return 0.3;
    case "GREAT_CITY":
      return 0.6;
    case "METROPOLIS":
      return 1;
    default:
      return 0.1;
  }
};

const supportSummaryForTown = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): { supportCurrent: number; supportMax: number } => {
  if (tile.ownershipState !== "SETTLED") return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      supportMax += 1;
      if (neighbor.ownerId === playerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const hasSupportedStructure = (
  playerId: string,
  tile: DomainTileState,
  structureType: string,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
      if (neighbor.economicStructure?.ownerId === playerId && neighbor.economicStructure.status === "active" && neighbor.economicStructure.type === structureType) return true;
    }
  }
  return false;
};

const buildFedTownKeys = (
  player: DomainPlayer,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>,
  strategicProductionPerMinute: Record<StrategicResourceKey, number>
): Set<string> => {
  const availableFood = (player.strategicResources?.FOOD ?? 0) + strategicProductionPerMinute.FOOD;
  let remainingFood = availableFood;
  const fedTownKeys = new Set<string>();
  const ownedSettledTowns = [...summary.territoryTileKeys]
    .map((tileKey) => tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile?.town && tile.ownerId === player.id && tile.ownershipState === "SETTLED"))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y));
  for (const tile of ownedSettledTowns) {
    const upkeep = townFoodUpkeepPerMinute(tile.town?.populationTier);
    if (upkeep <= 0) {
      fedTownKeys.add(`${tile.x},${tile.y}`);
      continue;
    }
    if (remainingFood + 1e-9 >= upkeep) {
      fedTownKeys.add(`${tile.x},${tile.y}`);
      remainingFood = Math.max(0, remainingFood - upkeep);
    }
  }
  return fedTownKeys;
};

export const buildPlayerUpdateEconomySnapshot = (
  player: DomainPlayer,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>
): PlayerUpdateEconomySnapshot => {
  const incomeMultiplier = player.mods?.income ?? 1;
  const strategicProductionPerMinute = {
    ...summary.strategicProductionPerMinute
  };
  const settledTiles = [...summary.territoryTileKeys]
    .map((tileKey) => tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile && tile.ownerId === player.id && tile.ownershipState === "SETTLED"));

  for (const tile of settledTiles) {
    const structure = tile.economicStructure;
    if (structure?.ownerId === player.id && structure.status === "active") {
      const output = converterOutputPerMinute(structure.type);
      for (const [resourceKey, amount] of Object.entries(output) as Array<[StrategicResourceKey, number]>) {
        strategicProductionPerMinute[resourceKey] += amount;
      }
    }
  }

  const fedTownKeys = buildFedTownKeys(player, summary, tiles, strategicProductionPerMinute);
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

  for (const tile of settledTiles) {
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
      addBucket(
        target,
        tile.resource === "FARM" ? "Grain" :
          tile.resource === "FISH" ? "Fish" :
          tile.resource === "IRON" ? "Iron" :
          tile.resource === "GEMS" ? "Crystal" :
          tile.resource === "OIL" ? "Oil" :
          "Supply",
        resourceRate,
        { count: 1, resourceKey }
      );
    }
    if (tile.town) {
      const tileKey = `${tile.x},${tile.y}`;
      const isSettlement = tile.town.populationTier === "SETTLEMENT";
      const support = isSettlement ? { supportCurrent: 0, supportMax: 0 } : supportSummaryForTown(player.id, tile, tiles);
      const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
      const hasMarket = hasSupportedStructure(player.id, tile, "MARKET", tiles);
      const hasBank = hasSupportedStructure(player.id, tile, "BANK", tiles);
      const goldPerMinute =
        isSettlement
          ? SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT
          : !fedTownKeys.has(tileKey)
            ? 0
            : (
                TOWN_BASE_GOLD_PER_MIN *
                supportRatio *
                townPopulationMultiplier(tile.town.populationTier) *
                (1 + (tile.town.connectedTownBonus ?? 0)) *
                (hasMarket ? 1.5 : 1) *
                (hasBank ? 1.5 : 1) *
                incomeMultiplier *
                PASSIVE_INCOME_MULT
              ) + (hasBank ? 1 : 0);
      if (goldPerMinute > 0) addBucket(goldSources, "Towns", goldPerMinute, { count: 1 });
      addBucket(foodSinks, "Town", townFoodUpkeepPerMinute(tile.town.populationTier), { count: 1 });
    }
    if (tile.dockId) addBucket(goldSources, "Docks", DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT, { count: 1 });
    if (tile.fort?.ownerId === player.id && tile.fort.status === "active") {
      addBucket(goldSinks, "Fort", 1, { count: 1 });
      addBucket(ironSinks, "Fort", 0.025, { count: 1 });
    }
    if (tile.siegeOutpost?.ownerId === player.id && tile.siegeOutpost.status === "active") {
      addBucket(goldSinks, "Siege outpost", 1, { count: 1 });
      addBucket(supplySinks, "Siege outpost", 0.025, { count: 1 });
    }
    if (tile.observatory?.ownerId === player.id && tile.observatory.status === "active") {
      addBucket(crystalSinks, "Observatory", OBSERVATORY_UPKEEP_PER_MIN, { count: 1 });
    }
    const structure = tile.economicStructure;
    if (structure?.ownerId === player.id && structure.status === "active") {
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
      : Math.max(0, Math.min(1, (((player.strategicResources?.FOOD ?? 0) + strategicProductionPerMinute.FOOD) / upkeepPerMinute.food)));

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
    }
  };
};
