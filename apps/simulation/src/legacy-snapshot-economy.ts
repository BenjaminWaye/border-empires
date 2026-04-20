import {
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  ADVANCED_IRONWORKS_IRON_PER_DAY,
  AIRPORT_OIL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  DOCK_INCOME_PER_MIN,
  FARMSTEAD_GOLD_UPKEEP,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  FOUNDRY_OUTPUT_MULT,
  FOUNDRY_RADIUS,
  FOUNDRY_GOLD_UPKEEP,
  FUEL_PLANT_OIL_PER_DAY,
  FUEL_PLANT_GOLD_UPKEEP,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  IRONWORKS_IRON_PER_DAY,
  IRONWORKS_GOLD_UPKEEP,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  MINE_GOLD_UPKEEP,
  PASSIVE_INCOME_MULT,
  RADAR_SYSTEM_GOLD_UPKEEP,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  STRUCTURE_OUTPUT_MULT,
  TOWN_BASE_GOLD_PER_MIN,
  WOODEN_FORT_GOLD_UPKEEP,
  type SnapshotEconomySection,
  type SnapshotPlayersSection,
  type SnapshotSystemsSection,
  type SnapshotTerritorySection,
  type StrategicResource,
  type TownDefinition
} from "@border-empires/game-domain";
import { OBSERVATORY_UPKEEP_PER_MIN, terrainAt } from "@border-empires/shared";

type EconomyResourceKey = "GOLD" | "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";

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

export type LegacySnapshotPlayerEconomy = {
  incomePerMinute: number;
  strategicResources: Record<StrategicResource, number>;
  strategicProductionPerMinute: Record<StrategicResource, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
};

const emptyStrategic = (): Record<StrategicResource, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0,
  OIL: 0
});

const emptyEconomyBreakdown = (): EconomyBreakdown => ({
  GOLD: { sources: [], sinks: [] },
  FOOD: { sources: [], sinks: [] },
  IRON: { sources: [], sinks: [] },
  CRYSTAL: { sources: [], sinks: [] },
  SUPPLY: { sources: [], sinks: [] },
  SHARD: { sources: [], sinks: [] },
  OIL: { sources: [], sinks: [] }
});

const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()].sort((left, right) => right.amountPerMinute - left.amountPerMinute || left.label.localeCompare(right.label));

const addBucket = (
  buckets: Map<string, EconomyBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (amountPerMinute <= 0.0001) return;
  const existing = buckets.get(label);
  if (existing) {
    existing.amountPerMinute += amountPerMinute;
    existing.count += options.count ?? 1;
    if (options.resourceKey) existing.resourceKey = options.resourceKey;
    if (options.note) existing.note = options.note;
    return;
  }
  buckets.set(label, {
    label,
    amountPerMinute,
    count: options.count ?? 1,
    ...(options.resourceKey ? { resourceKey: options.resourceKey } : {}),
    ...(options.note ? { note: options.note } : {})
  });
};

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return { x, y };
};

const chebyshevDistance = (left: { x: number; y: number }, right: { x: number; y: number }): number =>
  Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const townPopulationTier = (town: TownDefinition): "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" => {
  if (town.isSettlement && town.population < 1_000) return "SETTLEMENT";
  if (town.population >= 5_000_000) return "METROPOLIS";
  if (town.population >= 1_000_000) return "GREAT_CITY";
  if (town.population >= 100_000) return "CITY";
  if (town.population >= 1_000) return "TOWN";
  return "SETTLEMENT";
};

const townPopulationMultiplier = (town: TownDefinition): number => {
  const tier = townPopulationTier(town);
  if (tier === "SETTLEMENT") return 0.6;
  if (tier === "CITY") return 1.5;
  if (tier === "GREAT_CITY") return 2.5;
  if (tier === "METROPOLIS") return 3.2;
  return 1;
};

const townFoodUpkeepPerMinute = (town: TownDefinition): number => {
  const tier = townPopulationTier(town);
  if (tier === "SETTLEMENT") return 0;
  if (tier === "CITY") return 0.2;
  if (tier === "GREAT_CITY") return 0.4;
  if (tier === "METROPOLIS") return 0.8;
  return 0.1;
};

const resourceSourceLabel = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "Grain";
  if (resource === "FISH") return "Fish";
  if (resource === "FUR") return "Fur";
  if (resource === "WOOD") return "Wood";
  if (resource === "IRON") return "Iron";
  if (resource === "GEMS") return "Gems";
  if (resource === "OIL") return "Oil";
  return undefined;
};

const toStrategicResource = (resource: string | undefined): StrategicResource | undefined => {
  if (resource === "FARM" || resource === "FISH") return "FOOD";
  if (resource === "IRON") return "IRON";
  if (resource === "GEMS") return "CRYSTAL";
  if (resource === "WOOD" || resource === "FUR") return "SUPPLY";
  if (resource === "OIL") return "OIL";
  return undefined;
};

const strategicDailyFromResource = (resource: string | undefined): number => {
  if (resource === "FARM") return 72;
  if (resource === "FISH") return 48;
  if (resource === "IRON") return 60;
  if (resource === "FUR") return 60;
  if (resource === "WOOD") return 60;
  if (resource === "GEMS") return 36;
  if (resource === "OIL") return 48;
  return 0;
};

const converterStructureOutputFor = (
  structureType: string
): Partial<Record<StrategicResource, number>> | undefined => {
  if (structureType === "FUR_SYNTHESIZER") return { SUPPLY: FUR_SYNTHESIZER_SUPPLY_PER_DAY };
  if (structureType === "ADVANCED_FUR_SYNTHESIZER") return { SUPPLY: ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY };
  if (structureType === "IRONWORKS") return { IRON: IRONWORKS_IRON_PER_DAY };
  if (structureType === "ADVANCED_IRONWORKS") return { IRON: ADVANCED_IRONWORKS_IRON_PER_DAY };
  if (structureType === "CRYSTAL_SYNTHESIZER") return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
  if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") return { CRYSTAL: ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
  if (structureType === "FUEL_PLANT") return { OIL: FUEL_PLANT_OIL_PER_DAY };
  return undefined;
};

const economicStructureOutputMultAt = (
  tileKey: string,
  ownerId: string,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>
): number => {
  const structure = structuresByTile.get(tileKey);
  if (!structure || structure.ownerId !== ownerId || structure.status !== "active") return 1;
  if (
    structure.type === "GRANARY" ||
    structure.type === "MARKET" ||
    structure.type === "BANK" ||
    structure.type === "AIRPORT" ||
    structure.type === "WOODEN_FORT" ||
    structure.type === "LIGHT_OUTPOST" ||
    structure.type === "FUR_SYNTHESIZER" ||
    structure.type === "ADVANCED_FUR_SYNTHESIZER" ||
    structure.type === "IRONWORKS" ||
    structure.type === "ADVANCED_IRONWORKS" ||
    structure.type === "CRYSTAL_SYNTHESIZER" ||
    structure.type === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
    structure.type === "FUEL_PLANT" ||
    structure.type === "FOUNDRY" ||
    structure.type === "GOVERNORS_OFFICE" ||
    structure.type === "RADAR_SYSTEM"
  ) {
    return 1;
  }
  let multiplier = STRUCTURE_OUTPUT_MULT;
  if (structure.type === "MINE") {
    const origin = parseTileKey(tileKey);
    if (origin) {
      for (const [candidateTileKey, candidate] of structuresByTile) {
        if (candidate.ownerId !== ownerId || candidate.status !== "active" || candidate.type !== "FOUNDRY") continue;
        const candidateCoords = parseTileKey(candidateTileKey);
        if (!candidateCoords) continue;
        if (chebyshevDistance(origin, candidateCoords) <= FOUNDRY_RADIUS) {
          multiplier *= FOUNDRY_OUTPUT_MULT;
          break;
        }
      }
    }
  }
  return multiplier;
};

const goldUpkeepPerMinuteForStructure = (structureType: string): number => {
  switch (structureType) {
    case "FARMSTEAD": return FARMSTEAD_GOLD_UPKEEP / 10;
    case "CAMP": return CAMP_GOLD_UPKEEP / 10;
    case "MINE": return MINE_GOLD_UPKEEP / 10;
    case "GRANARY": return GRANARY_GOLD_UPKEEP / 10;
    case "WOODEN_FORT": return WOODEN_FORT_GOLD_UPKEEP / 10;
    case "LIGHT_OUTPOST": return LIGHT_OUTPOST_GOLD_UPKEEP / 10;
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER": return CAMP_GOLD_UPKEEP / 10;
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS": return IRONWORKS_GOLD_UPKEEP / 10;
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10;
    case "FUEL_PLANT": return FUEL_PLANT_GOLD_UPKEEP / 10;
    case "FOUNDRY": return FOUNDRY_GOLD_UPKEEP / 10;
    case "GARRISON_HALL": return GARRISON_HALL_GOLD_UPKEEP / 10;
    case "CUSTOMS_HOUSE": return CUSTOMS_HOUSE_GOLD_UPKEEP / 10;
    case "GOVERNORS_OFFICE": return GOVERNORS_OFFICE_GOLD_UPKEEP / 10;
    case "RADAR_SYSTEM": return RADAR_SYSTEM_GOLD_UPKEEP / 10;
    default: return 0;
  }
};

const foodUpkeepPerMinuteForStructure = (structureType: string): number => {
  if (structureType === "MARKET") return MARKET_FOOD_UPKEEP / 10;
  if (structureType === "BANK") return BANK_FOOD_UPKEEP / 10;
  if (structureType === "CARAVANARY") return CARAVANARY_FOOD_UPKEEP / 10;
  return 0;
};

const structureLabel = (structureType: string): string => {
  return structureType
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const sourceLabelForTile = (args: {
  tileKey: string;
  strategicKey?: StrategicResource;
  townsByTile: Map<string, TownDefinition>;
  docksByTile: Map<string, { tileKey: string }>;
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>;
  tileYieldEntries: NonNullable<SnapshotEconomySection["tileYield"]>;
}): string => {
  const structure = args.structuresByTile.get(args.tileKey);
  if (structure?.status === "active") return structureLabel(structure.type);
  if (args.townsByTile.has(args.tileKey)) return "Towns";
  if (args.docksByTile.has(args.tileKey)) return "Docks";
  const tileResource = inferTileResource(args.tileKey, args.tileYieldEntries, []);
  const resourceLabel = resourceSourceLabel(tileResource);
  if (resourceLabel) return resourceLabel;
  if (args.strategicKey === "SHARD") return "Shard sites";
  return "Settled land";
};

const supportedStructureAtTown = (
  townTileKey: string,
  ownerId: string,
  structureType: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>,
  world: { width: number; height: number }
): boolean => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) !== ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
      const structure = structuresByTile.get(tileKey);
      if (!structure || structure.ownerId !== ownerId || structure.status !== "active") continue;
      if (structure.type === structureType) return true;
    }
  }
  return false;
};

const supportedStructureAtDock = (
  dockTileKey: string,
  ownerId: string,
  structureType: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>,
  world: { width: number; height: number }
): boolean => supportedStructureAtTown(dockTileKey, ownerId, structureType, ownershipByTile, ownershipStateByTile, structuresByTile, world);

const supportRatioForTown = (
  townTileKey: string,
  ownerId: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  world: { width: number; height: number }
): { supportCurrent: number; supportMax: number } => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      supportMax += 1;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) === ownerId && ownershipStateByTile.get(tileKey) === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

export const buildLegacySnapshotPlayerEconomies = (args: {
  world: { width: number; height: number };
  playersSection: SnapshotPlayersSection;
  territory: SnapshotTerritorySection;
  economy: SnapshotEconomySection;
  systems: SnapshotSystemsSection;
}): Map<string, LegacySnapshotPlayerEconomy> => {
  const ownershipByTile = new Map<string, string>(args.territory.ownership ?? []);
  const ownershipStateByTile = new Map<string, string>(args.territory.ownershipState ?? []);
  const townsByTile = new Map((args.territory.towns ?? []).map((town) => [town.tileKey, town] as const));
  const docksById = new Map((args.territory.docks ?? []).map((dock) => [dock.dockId, dock] as const));
  const docksByTile = new Map((args.territory.docks ?? []).map((dock) => [dock.tileKey, dock] as const));
  const activeStructures = (args.systems.economicStructures ?? []).filter((structure) => structure.status === "active");
  const structuresByTile = new Map(activeStructures.map((structure) => [structure.tileKey, structure] as const));
  const activeObservatories = (args.systems.observatories ?? []).filter((observatory) => observatory.status === "active");
  const strategicResourcesByPlayer = new Map<string, Record<StrategicResource, number>>(
    (args.economy.strategicResources ?? []).map(([playerId, resources]) => [
      playerId,
      { FOOD: resources.FOOD ?? 0, IRON: resources.IRON ?? 0, CRYSTAL: resources.CRYSTAL ?? 0, SUPPLY: resources.SUPPLY ?? 0, SHARD: resources.SHARD ?? 0, OIL: resources.OIL ?? 0 }
    ])
  );

  const sourceBucketsByPlayer = new Map<string, Record<EconomyResourceKey, Map<string, EconomyBucket>>>();
  const sinkBucketsByPlayer = new Map<string, Record<EconomyResourceKey, Map<string, EconomyBucket>>>();
  const strategicProductionPerMinuteByPlayer = new Map<string, Record<StrategicResource, number>>();
  const upkeepPerMinuteByPlayer = new Map<string, UpkeepPerMinute>();
  const goldIncomePerMinuteByPlayer = new Map<string, number>();

  const bucketMapsForPlayer = (
    store: Map<string, Record<EconomyResourceKey, Map<string, EconomyBucket>>>,
    playerId: string
  ): Record<EconomyResourceKey, Map<string, EconomyBucket>> => {
    const existing = store.get(playerId);
    if (existing) return existing;
    const created = {
      GOLD: new Map<string, EconomyBucket>(),
      FOOD: new Map<string, EconomyBucket>(),
      IRON: new Map<string, EconomyBucket>(),
      CRYSTAL: new Map<string, EconomyBucket>(),
      SUPPLY: new Map<string, EconomyBucket>(),
      SHARD: new Map<string, EconomyBucket>(),
      OIL: new Map<string, EconomyBucket>()
    };
    store.set(playerId, created);
    return created;
  };

  for (const player of args.playersSection.players) {
    const playerId = player.id;
    const sourceBuckets = bucketMapsForPlayer(sourceBucketsByPlayer, playerId);
    const sinkBuckets = bucketMapsForPlayer(sinkBucketsByPlayer, playerId);
    const strategicResources = strategicResourcesByPlayer.get(playerId) ?? emptyStrategic();
    const strategicProduction = strategicProductionPerMinuteByPlayer.get(playerId) ?? emptyStrategic();
    const upkeep: UpkeepPerMinute = { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 };

    const ownedTowns = (args.territory.towns ?? []).filter((town) => ownershipByTile.get(town.tileKey) === playerId && ownershipStateByTile.get(town.tileKey) === "SETTLED");
    const ownedDocks = (args.territory.docks ?? []).filter((dock) => ownershipByTile.get(dock.tileKey) === playerId && ownershipStateByTile.get(dock.tileKey) === "SETTLED");
    const activePlayerStructures = activeStructures.filter((structure) => structure.ownerId === playerId);
    const activeSettledTileKeys = player.territoryTiles.filter((tileKey) => ownershipStateByTile.get(tileKey) === "SETTLED");

    const townFoodNeeds = ownedTowns.map((town) => ({ town, need: townFoodUpkeepPerMinute(town) }));
    const totalFoodNeed = townFoodNeeds.reduce((total, entry) => total + entry.need, 0);
    let remainingFood = Math.max(0, strategicResources.FOOD + strategicProduction.FOOD);
    const fedTownKeys = new Set<string>();
    for (const entry of townFoodNeeds) {
      if (entry.need <= 0) {
        fedTownKeys.add(entry.town.tileKey);
      } else if (remainingFood + 1e-9 >= entry.need) {
        fedTownKeys.add(entry.town.tileKey);
        remainingFood = Math.max(0, remainingFood - entry.need);
      }
    }
    const foodCoverage = totalFoodNeed <= 0 ? 1 : Math.max(0, Math.min(1, (strategicResources.FOOD + strategicProduction.FOOD) / totalFoodNeed));

    let goldIncome = 0;
    let townIncome = 0;
    let dockIncome = 0;
    let bankFlatIncome = 0;

    for (const tileKey of activeSettledTileKeys) {
      const resource = inferTileResource(tileKey, args.economy.tileYield ?? [], []);
      const strategicKey = toStrategicResource(resource);
      if (!resource || !strategicKey) continue;
      const amountPerMinute =
        (strategicDailyFromResource(resource) / 1440) *
        economicStructureOutputMultAt(tileKey, playerId, structuresByTile);
      if (amountPerMinute <= 0.0001) continue;
      strategicProduction[strategicKey] += amountPerMinute;
      addBucket(
        sourceBuckets[strategicKey],
        sourceLabelForTile({
          tileKey,
          strategicKey,
          townsByTile,
          docksByTile,
          structuresByTile,
          tileYieldEntries: args.economy.tileYield ?? []
        }) ?? strategicKey,
        amountPerMinute,
        { resourceKey: strategicKey, count: 1 }
      );
    }

    for (const structure of activePlayerStructures) {
      const output = converterStructureOutputFor(structure.type) ?? {};
      for (const [strategicKey, daily] of Object.entries(output) as Array<[StrategicResource, number]>) {
        const amountPerMinute = daily / 1440;
        if (amountPerMinute <= 0.0001) continue;
        strategicProduction[strategicKey] += amountPerMinute;
        addBucket(sourceBuckets[strategicKey], structureLabel(structure.type), amountPerMinute, {
          resourceKey: strategicKey,
          count: 1
        });
      }
    }
    strategicProductionPerMinuteByPlayer.set(playerId, strategicProduction);

    for (const town of ownedTowns) {
      const tier = townPopulationTier(town);
      if (tier === "SETTLEMENT") {
        townIncome += SETTLEMENT_BASE_GOLD_PER_MIN * (player.mods?.income ?? 1) * PASSIVE_INCOME_MULT;
        continue;
      }
      const { supportCurrent, supportMax } = supportRatioForTown(town.tileKey, playerId, ownershipByTile, ownershipStateByTile, args.world);
      const supportRatio = supportMax <= 0 ? 1 : supportCurrent / supportMax;
      if (!fedTownKeys.has(town.tileKey)) continue;
      const hasMarket = supportedStructureAtTown(town.tileKey, playerId, "MARKET", ownershipByTile, ownershipStateByTile, structuresByTile, args.world);
      const hasBank = supportedStructureAtTown(town.tileKey, playerId, "BANK", ownershipByTile, ownershipStateByTile, structuresByTile, args.world);
      const marketMult = hasMarket ? 1.5 : 1;
      const bankMult = hasBank ? 1.5 : 1;
      const bankFlat = hasBank ? 1 : 0;
      const currentTownIncome =
        TOWN_BASE_GOLD_PER_MIN *
        supportRatio *
        townPopulationMultiplier(town) *
        (1 + town.connectedTownBonus) *
        marketMult *
        bankMult *
        (player.mods?.income ?? 1) *
        PASSIVE_INCOME_MULT;
      townIncome += currentTownIncome;
      bankFlatIncome += bankFlat;
      if (hasMarket) addBucket(sourceBuckets.GOLD, "Market bonus", currentTownIncome - currentTownIncome / marketMult, { count: 1 });
      if (hasBank) addBucket(sourceBuckets.GOLD, "Bank bonus", currentTownIncome - currentTownIncome / bankMult + bankFlat, { count: 1 });
    }

    for (const dock of ownedDocks) {
      let connectedCount = 0;
      for (const dockId of dock.connectedDockIds?.length ? dock.connectedDockIds : [dock.pairedDockId]) {
        const linked = docksById.get(dockId);
        if (!linked) continue;
        if (ownershipByTile.get(linked.tileKey) === playerId && ownershipStateByTile.get(linked.tileKey) === "SETTLED") connectedCount += 1;
      }
      const customsMult = supportedStructureAtDock(dock.tileKey, playerId, "CUSTOMS_HOUSE", ownershipByTile, ownershipStateByTile, structuresByTile, args.world) ? 1.5 : 1;
      dockIncome += DOCK_INCOME_PER_MIN * (1 + 0.5 * connectedCount) * customsMult * (player.mods?.income ?? 1) * PASSIVE_INCOME_MULT;
    }

    goldIncome = townIncome + bankFlatIncome + dockIncome;
    if (townIncome > 0) addBucket(sourceBuckets.GOLD, "Towns", townIncome, { count: ownedTowns.length, note: `${ownedTowns.length} settled towns` });
    if (bankFlatIncome > 0) addBucket(sourceBuckets.GOLD, "Banks", bankFlatIncome, { count: activePlayerStructures.filter((structure) => structure.type === "BANK").length });
    if (dockIncome > 0) addBucket(sourceBuckets.GOLD, "Docks", dockIncome, { count: ownedDocks.length, note: `${ownedDocks.length} settled docks` });

    const settledLandGoldUpkeep = activeSettledTileKeys.reduce((total, tileKey) => {
      const town = townsByTile.get(tileKey);
      return total + (town && townPopulationTier(town) === "SETTLEMENT" ? 0 : 0.04);
    }, 0);
    upkeep.gold += settledLandGoldUpkeep;
    addBucket(sinkBuckets.GOLD, "Settled land upkeep", settledLandGoldUpkeep, { count: activeSettledTileKeys.length, note: `${activeSettledTileKeys.length} settled tiles` });

    const townFoodUpkeep = townFoodNeeds.reduce((total, entry) => total + entry.need, 0);
    upkeep.food += townFoodUpkeep;
    addBucket(sinkBuckets.FOOD, "Town upkeep", townFoodUpkeep, { count: ownedTowns.length, note: `${ownedTowns.length} towns` });

    for (const structure of activePlayerStructures) {
      const goldUpkeep = goldUpkeepPerMinuteForStructure(structure.type);
      if (goldUpkeep > 0) {
        upkeep.gold += goldUpkeep;
        addBucket(sinkBuckets.GOLD, `${structureLabel(structure.type)} upkeep`, goldUpkeep, { count: 1 });
      }
      const foodUpkeep = foodUpkeepPerMinuteForStructure(structure.type);
      if (foodUpkeep > 0) {
        upkeep.food += foodUpkeep;
        addBucket(sinkBuckets.FOOD, `${structureLabel(structure.type)} upkeep`, foodUpkeep, { count: 1 });
      }
      if (structure.type === "AIRPORT") {
        upkeep.oil += AIRPORT_OIL_UPKEEP_PER_MIN;
        addBucket(sinkBuckets.OIL, "Airport upkeep", AIRPORT_OIL_UPKEEP_PER_MIN, { count: 1 });
      }
    }

    const playerObservatories = activeObservatories.filter((observatory) => observatory.ownerId === playerId);
    if (playerObservatories.length > 0) {
      const observatoryUpkeep = playerObservatories.length * OBSERVATORY_UPKEEP_PER_MIN;
      upkeep.crystal += observatoryUpkeep;
      addBucket(sinkBuckets.CRYSTAL, "Observatory upkeep", observatoryUpkeep, {
        count: playerObservatories.length,
        note: `${playerObservatories.length} active observator${playerObservatories.length === 1 ? "y" : "ies"}`
      });
    }

    upkeepPerMinuteByPlayer.set(playerId, upkeep);
    goldIncomePerMinuteByPlayer.set(playerId, goldIncome);
  }

  const output = new Map<string, LegacySnapshotPlayerEconomy>();
  for (const player of args.playersSection.players) {
    const playerId = player.id;
    const sourceBuckets = bucketMapsForPlayer(sourceBucketsByPlayer, playerId);
    const sinkBuckets = bucketMapsForPlayer(sinkBucketsByPlayer, playerId);
    const upkeepPerMinute = upkeepPerMinuteByPlayer.get(playerId) ?? { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 };
    const economyBreakdown: EconomyBreakdown = {
      GOLD: { sources: sortedBuckets(sourceBuckets.GOLD), sinks: sortedBuckets(sinkBuckets.GOLD) },
      FOOD: { sources: sortedBuckets(sourceBuckets.FOOD), sinks: sortedBuckets(sinkBuckets.FOOD) },
      IRON: { sources: sortedBuckets(sourceBuckets.IRON), sinks: sortedBuckets(sinkBuckets.IRON) },
      CRYSTAL: { sources: sortedBuckets(sourceBuckets.CRYSTAL), sinks: sortedBuckets(sinkBuckets.CRYSTAL) },
      SUPPLY: { sources: sortedBuckets(sourceBuckets.SUPPLY), sinks: sortedBuckets(sinkBuckets.SUPPLY) },
      SHARD: { sources: sortedBuckets(sourceBuckets.SHARD), sinks: sortedBuckets(sinkBuckets.SHARD) },
      OIL: { sources: sortedBuckets(sourceBuckets.OIL), sinks: sortedBuckets(sinkBuckets.OIL) }
    };
    const strategicResources = strategicResourcesByPlayer.get(playerId) ?? emptyStrategic();
    const strategicProductionPerMinute = strategicProductionPerMinuteByPlayer.get(playerId) ?? emptyStrategic();
    const foodNeed = upkeepPerMinute.food;
    const foodCoverage = foodNeed <= 0 ? 1 : Math.max(0, Math.min(1, (strategicResources.FOOD + strategicProductionPerMinute.FOOD) / foodNeed));
    output.set(playerId, {
      incomePerMinute: Number((goldIncomePerMinuteByPlayer.get(playerId) ?? 0).toFixed(2)),
      strategicResources,
      strategicProductionPerMinute: {
        FOOD: Number(strategicProductionPerMinute.FOOD.toFixed(4)),
        IRON: Number(strategicProductionPerMinute.IRON.toFixed(4)),
        CRYSTAL: Number(strategicProductionPerMinute.CRYSTAL.toFixed(4)),
        SUPPLY: Number(strategicProductionPerMinute.SUPPLY.toFixed(4)),
        SHARD: Number(strategicProductionPerMinute.SHARD.toFixed(4)),
        OIL: Number(strategicProductionPerMinute.OIL.toFixed(4))
      },
      upkeepPerMinute: {
        food: Number(upkeepPerMinute.food.toFixed(4)),
        iron: Number(upkeepPerMinute.iron.toFixed(4)),
        supply: Number(upkeepPerMinute.supply.toFixed(4)),
        crystal: Number(upkeepPerMinute.crystal.toFixed(4)),
        oil: Number(upkeepPerMinute.oil.toFixed(4)),
        gold: Number(upkeepPerMinute.gold.toFixed(4))
      },
      upkeepLastTick: {
        foodCoverage,
        gold: { contributors: economyBreakdown.GOLD.sinks },
        food: { contributors: economyBreakdown.FOOD.sinks },
        iron: { contributors: economyBreakdown.IRON.sinks },
        crystal: { contributors: economyBreakdown.CRYSTAL.sinks },
        supply: { contributors: economyBreakdown.SUPPLY.sinks },
        oil: { contributors: economyBreakdown.OIL.sinks }
      },
      economyBreakdown
    });
  }
  return output;
};

const inferTileResource = (
  tileKey: string,
  tileYieldEntries: NonNullable<SnapshotEconomySection["tileYield"]>,
  _ownershipEntries: SnapshotTerritorySection["ownership"]
): string | undefined => {
  const match = tileYieldEntries.find(([entryTileKey]) => entryTileKey === tileKey)?.[1];
  if (!match || !match.strategic) return undefined;
  if ((match.strategic.FOOD ?? 0) > 0) return "FARM";
  if ((match.strategic.IRON ?? 0) > 0) return "IRON";
  if ((match.strategic.CRYSTAL ?? 0) > 0) return "GEMS";
  if ((match.strategic.SUPPLY ?? 0) > 0) return "FUR";
  if ((match.strategic.OIL ?? 0) > 0) return "OIL";
  return undefined;
};
