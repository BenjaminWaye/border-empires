import {
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_TITANIUM_PER_DAY,
  AIRPORT_CRYSTAL_UPKEEP_PER_MIN,
  UMBRITE_RIG_GOLD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  DOCK_INCOME_PER_MIN,
  FARMSTEAD_GOLD_UPKEEP,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY,
  FOUNDRY_OUTPUT_MULT,
  FOUNDRY_RADIUS,
  FOUNDRY_GOLD_UPKEEP,
  WATERWORKS_OUTPUT_MULT,
  WATERWORKS_RADIUS,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  TITANIUM_WORKS_TITANIUM_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  MINTWORKS_FOOD_UPKEEP,
  mintworksGoldProductionMultiplier,
  MINE_GOLD_UPKEEP,
  PASSIVE_INCOME_MULT,
  RADAR_SYSTEM_GOLD_UPKEEP,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  STRUCTURE_OUTPUT_MULT,
  TOWN_BASE_GOLD_PER_MIN,
  townFoodUpkeepPerMinute as sharedTownFoodUpkeepPerMinute,
  townPopulationMultiplier as sharedTownPopulationMultiplier,
  UPKEEP_MINUTES_PER_DAY,
  type SnapshotEconomySection,
  type SnapshotPlayersSection,
  type SnapshotSystemsSection,
  type SnapshotTerritorySection,
  type DomainStrategicResourceKey,
  type TownDefinition
} from "@border-empires/game-domain";
import { OBSERVATORY_UPKEEP_PER_MIN, terrainAt } from "@border-empires/shared";

type EconomyResourceKey = "GOLD" | "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";

type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  resourceKey?: EconomyResourceKey;
  note?: string;
};

type EconomyBreakdown = Record<EconomyResourceKey, { sources: EconomyBucket[]; sinks: EconomyBucket[] }>;

type UpkeepPerMinute = { food: number; titanium: number; umbrite: number; crystal: number; gold: number };

type UpkeepLastTick = {
  foodCoverage: number;
  gold: { contributors: EconomyBucket[] };
  food: { contributors: EconomyBucket[] };
  titanium: { contributors: EconomyBucket[] };
  crystal: { contributors: EconomyBucket[] };
  umbrite: { contributors: EconomyBucket[] };
};

export type LegacySnapshotPlayerEconomy = {
  incomePerMinute: number;
  strategicResources: Record<DomainStrategicResourceKey, number>;
  strategicProductionPerMinute: Record<DomainStrategicResourceKey, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
};

const emptyStrategic = (): Record<DomainStrategicResourceKey, number> => ({
  FOOD: 0,
  TITANIUM: 0,
  CRYSTAL: 0,
  UMBRITE: 0,
  SHARD: 0
});

const emptyEconomyBreakdown = (): EconomyBreakdown => ({
  GOLD: { sources: [], sinks: [] },
  FOOD: { sources: [], sinks: [] },
  TITANIUM: { sources: [], sinks: [] },
  CRYSTAL: { sources: [], sinks: [] },
  UMBRITE: { sources: [], sinks: [] },
  SHARD: { sources: [], sinks: [] }
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

// townPopulationMultiplier/townFoodUpkeepPerMinute delegate to the shared
// game-domain functions — see the doc comments there for why the
// SETTLEMENT case (0.6 here previously) was confirmed-dead code, and why
// food upkeep is always 0 now (§5.3/§5.4 FOOD-as-slots rewrite). This file
// used to keep its own independently-hardcoded copies of both tables.
const townPopulationMultiplier = (town: TownDefinition): number =>
  sharedTownPopulationMultiplier(townPopulationTier(town));

const townFoodUpkeepPerMinute = (town: TownDefinition): number =>
  sharedTownFoodUpkeepPerMinute(townPopulationTier(town));


const resourceSourceLabel = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "Grain";
  if (resource === "FISH") return "Fish";
  if (resource === "UMBRITE") return "Umbrite";
  if (resource === "TITANIUM") return "Titanium";
  if (resource === "GEMS") return "Gems";
  return undefined;
};

const toStrategicResource = (resource: string | undefined): DomainStrategicResourceKey | undefined => {
  if (resource === "FARM" || resource === "FISH") return "FOOD";
  if (resource === "TITANIUM") return "TITANIUM";
  if (resource === "GEMS") return "CRYSTAL";
  if (resource === "UMBRITE") return "UMBRITE";
  return undefined;
};

const strategicDailyFromResource = (resource: string | undefined): number => {
  if (resource === "FARM") return 48;
  if (resource === "FISH") return 72;
  if (resource === "TITANIUM") return 60;
  if (resource === "UMBRITE") return 60;
  if (resource === "GEMS") return 36;
  return 0;
};

const converterStructureOutputFor = (
  structureType: string
): Partial<Record<DomainStrategicResourceKey, number>> | undefined => {
  if (structureType === "UMBRITE_SYNTHESIZER") return { UMBRITE: UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY };
  if (structureType === "ADVANCED_UMBRITE_SYNTHESIZER") return { UMBRITE: ADVANCED_UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY };
  if (structureType === "TITANIUM_WORKS") return { TITANIUM: TITANIUM_WORKS_TITANIUM_PER_DAY };
  if (structureType === "ADVANCED_TITANIUM_WORKS") return { TITANIUM: ADVANCED_TITANIUM_WORKS_TITANIUM_PER_DAY };
  if (structureType === "CRYSTAL_SYNTHESIZER") return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
  if (structureType === "ADVANCED_CRYSTAL_SYNTHESIZER") return { CRYSTAL: ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
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
    structure.type === "MINTWORKS" ||
    structure.type === "AIRPORT" ||
    structure.type === "WOODEN_FORT" ||
    structure.type === "RELAY_BEACON" ||
    structure.type === "UMBRITE_SYNTHESIZER" ||
    structure.type === "ADVANCED_UMBRITE_SYNTHESIZER" ||
    structure.type === "TITANIUM_WORKS" ||
    structure.type === "ADVANCED_TITANIUM_WORKS" ||
    structure.type === "CRYSTAL_SYNTHESIZER" ||
    structure.type === "ADVANCED_CRYSTAL_SYNTHESIZER" ||
    structure.type === "FOUNDRY" ||
    structure.type === "WATERWORKS" ||
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
  if (structure.type === "FARMSTEAD") {
    const origin = parseTileKey(tileKey);
    if (origin) {
      for (const [candidateTileKey, candidate] of structuresByTile) {
        if (candidate.ownerId !== ownerId || candidate.status !== "active" || candidate.type !== "WATERWORKS") continue;
        const candidateCoords = parseTileKey(candidateTileKey);
        if (!candidateCoords) continue;
        if (chebyshevDistance(origin, candidateCoords) <= WATERWORKS_RADIUS) {
          multiplier *= WATERWORKS_OUTPUT_MULT;
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
    case "UMBRITE_RIG": return UMBRITE_RIG_GOLD_UPKEEP / 10;
    case "MINE": return MINE_GOLD_UPKEEP / 10;
    case "GRANARY": return GRANARY_GOLD_UPKEEP / 10;
    // §6.4 (docs/manpower-economy-rewrite-plan.md): this switch previously
    // had BOTH the base and Advanced Umbrite Synthesizer cases returning
    // UMBRITE_RIG_GOLD_UPKEEP instead of their own rate — a third, previously-
    // unfound instance of the exact "Advanced synthesizer costs less to
    // run than the thing it upgrades" bug class §6.4 already flagged for
    // the live-code/live-screenshot discrepancy. Fixed to each synthesizer's
    // own §6.4-decided gold/day figure.
    case "UMBRITE_SYNTHESIZER": return UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY;
    case "ADVANCED_UMBRITE_SYNTHESIZER": return ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY;
    case "TITANIUM_WORKS": return TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY;
    case "ADVANCED_TITANIUM_WORKS": return ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY;
    case "CRYSTAL_SYNTHESIZER": return CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY;
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY;
    case "FOUNDRY": return FOUNDRY_GOLD_UPKEEP / 10;
    case "GARRISON_HALL": return GARRISON_HALL_GOLD_UPKEEP / 10;
    case "CUSTOMS_HOUSE": return CUSTOMS_HOUSE_GOLD_UPKEEP / 10;
    case "GOVERNORS_OFFICE": return GOVERNORS_OFFICE_GOLD_UPKEEP / 10;
    case "RADAR_SYSTEM": return RADAR_SYSTEM_GOLD_UPKEEP / 10;
    default: return 0;
  }
};

// §upkeep-rebalance: Relay Beacon/Wooden Fort and the Fort/Siege ladders all carry a flat 1 FOOD (0.1/min) upkeep.
const MILITARY_FOOD_UPKEEP_TYPES = new Set(["WOODEN_FORT", "RELAY_BEACON", "FORT", "TITANIUM_BASTION", "THUNDER_BASTION", "SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"]);

const foodUpkeepPerMinuteForStructure = (structureType: string): number => {
  if (structureType === "MINTWORKS") return MINTWORKS_FOOD_UPKEEP / 10;
  if (structureType === "CARAVANARY") return CARAVANARY_FOOD_UPKEEP / 10;
  if (MILITARY_FOOD_UPKEEP_TYPES.has(structureType)) return 0.1;
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
  strategicKey?: DomainStrategicResourceKey;
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

// mintworks-stacking task: counting sibling of supportedStructureAtTown above,
// same support-ring loop, for Mintworks's now-additive-per-instance gold bonus
// (mintworksGoldProductionMultiplier). Boolean uniqueness/gate checks elsewhere
// in this file keep using supportedStructureAtTown unchanged.
const countedStructuresAtTown = (
  townTileKey: string,
  ownerId: string,
  structureType: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>,
  world: { width: number; height: number }
): number => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return 0;
  let count = 0;
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
      if (structure.type === structureType) count += 1;
    }
  }
  return count;
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
  const strategicResourcesByPlayer = new Map<string, Record<DomainStrategicResourceKey, number>>(
    (args.economy.strategicResources ?? []).map(([playerId, resources]) => [
      playerId,
      { FOOD: resources.FOOD ?? 0, TITANIUM: resources.TITANIUM ?? 0, CRYSTAL: resources.CRYSTAL ?? 0, UMBRITE: resources.UMBRITE ?? 0, SHARD: resources.SHARD ?? 0 }
    ])
  );

  const sourceBucketsByPlayer = new Map<string, Record<EconomyResourceKey, Map<string, EconomyBucket>>>();
  const sinkBucketsByPlayer = new Map<string, Record<EconomyResourceKey, Map<string, EconomyBucket>>>();
  const strategicProductionPerMinuteByPlayer = new Map<string, Record<DomainStrategicResourceKey, number>>();
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
      TITANIUM: new Map<string, EconomyBucket>(),
      CRYSTAL: new Map<string, EconomyBucket>(),
      UMBRITE: new Map<string, EconomyBucket>(),
      SHARD: new Map<string, EconomyBucket>()
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
    const upkeep: UpkeepPerMinute = { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 };

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
      for (const [strategicKey, daily] of Object.entries(output) as Array<[DomainStrategicResourceKey, number]>) {
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
      const mintworksCount = countedStructuresAtTown(town.tileKey, playerId, "MINTWORKS", ownershipByTile, ownershipStateByTile, structuresByTile, args.world);
      const hasMintworks = mintworksCount > 0;
      // No town-level Clearing House signal exists on this legacy path
      // (pre-existing gap — Clearing House was never wired into this formula
      // even before mintworks-stacking). Detected here the same way Mintworks
      // itself is, via the local support-ring scan.
      const clearingHouseActive = supportedStructureAtTown(town.tileKey, playerId, "CLEARING_HOUSE", ownershipByTile, ownershipStateByTile, structuresByTile, args.world);
      const mintworksMult = mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive);
      const currentTownIncome =
        TOWN_BASE_GOLD_PER_MIN *
        supportRatio *
        townPopulationMultiplier(town) *
        (1 + town.connectedTownBonus) *
        mintworksMult *
        (player.mods?.income ?? 1) *
        PASSIVE_INCOME_MULT;
      townIncome += currentTownIncome;
      if (hasMintworks) addBucket(sourceBuckets.GOLD, "Mintworks bonus", currentTownIncome - currentTownIncome / mintworksMult, { count: 1 });
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

    goldIncome = townIncome + dockIncome;
    if (townIncome > 0) addBucket(sourceBuckets.GOLD, "Towns", townIncome, { count: ownedTowns.length, note: `${ownedTowns.length} settled towns` });
    if (dockIncome > 0) addBucket(sourceBuckets.GOLD, "Docks", dockIncome, { count: ownedDocks.length, note: `${ownedDocks.length} settled docks` });

    // §6 (docs/manpower-economy-rewrite-plan.md): gold's only remaining
    // jobs post-rewrite are tech/rush-buys/synthesizer upkeep — a flat
    // per-settled-tile gold drain isn't one of those, so it's retired
    // rather than rescaled.
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
        upkeep.crystal += AIRPORT_CRYSTAL_UPKEEP_PER_MIN;
        addBucket(sinkBuckets.CRYSTAL, "Airport upkeep", AIRPORT_CRYSTAL_UPKEEP_PER_MIN, { count: 1 });
      }
    }

    const playerObservatories = activeObservatories.filter((observatory) => observatory.ownerId === playerId);
    if (playerObservatories.length > 0) {
      const observatoryUpkeep = playerObservatories.length * OBSERVATORY_UPKEEP_PER_MIN;
      upkeep.crystal += observatoryUpkeep;
      addBucket(sinkBuckets.CRYSTAL, "Aether Tower upkeep", observatoryUpkeep, {
        count: playerObservatories.length,
        note: `${playerObservatories.length} active aether tower${playerObservatories.length === 1 ? "" : "s"}`
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
    const upkeepPerMinute = upkeepPerMinuteByPlayer.get(playerId) ?? { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 };
    const economyBreakdown: EconomyBreakdown = {
      GOLD: { sources: sortedBuckets(sourceBuckets.GOLD), sinks: sortedBuckets(sinkBuckets.GOLD) },
      FOOD: { sources: sortedBuckets(sourceBuckets.FOOD), sinks: sortedBuckets(sinkBuckets.FOOD) },
      TITANIUM: { sources: sortedBuckets(sourceBuckets.TITANIUM), sinks: sortedBuckets(sinkBuckets.TITANIUM) },
      CRYSTAL: { sources: sortedBuckets(sourceBuckets.CRYSTAL), sinks: sortedBuckets(sinkBuckets.CRYSTAL) },
      UMBRITE: { sources: sortedBuckets(sourceBuckets.UMBRITE), sinks: sortedBuckets(sinkBuckets.UMBRITE) },
      SHARD: { sources: sortedBuckets(sourceBuckets.SHARD), sinks: sortedBuckets(sinkBuckets.SHARD) }
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
        TITANIUM: Number(strategicProductionPerMinute.TITANIUM.toFixed(4)),
        CRYSTAL: Number(strategicProductionPerMinute.CRYSTAL.toFixed(4)),
        UMBRITE: Number(strategicProductionPerMinute.UMBRITE.toFixed(4)),
        SHARD: Number(strategicProductionPerMinute.SHARD.toFixed(4))
      },
      upkeepPerMinute: {
        food: Number(upkeepPerMinute.food.toFixed(4)),
        titanium: Number(upkeepPerMinute.titanium.toFixed(4)),
        umbrite: Number(upkeepPerMinute.umbrite.toFixed(4)),
        crystal: Number(upkeepPerMinute.crystal.toFixed(4)),
        gold: Number(upkeepPerMinute.gold.toFixed(4))
      },
      upkeepLastTick: {
        foodCoverage,
        gold: { contributors: economyBreakdown.GOLD.sinks },
        food: { contributors: economyBreakdown.FOOD.sinks },
        titanium: { contributors: economyBreakdown.TITANIUM.sinks },
        crystal: { contributors: economyBreakdown.CRYSTAL.sinks },
        umbrite: { contributors: economyBreakdown.UMBRITE.sinks }
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
  if ((match.strategic.TITANIUM ?? 0) > 0) return "TITANIUM";
  if ((match.strategic.CRYSTAL ?? 0) > 0) return "GEMS";
  if ((match.strategic.UMBRITE ?? 0) > 0) return "UMBRITE";
  return undefined;
};
