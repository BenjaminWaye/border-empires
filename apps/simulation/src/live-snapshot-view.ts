import { OBSERVATORY_UPKEEP_PER_MIN, WORLD_HEIGHT, WORLD_WIDTH, type Terrain, type Tile } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { shouldYieldAt } from "./event-loop-yield.js";

import {
  AIRPORT_CRYSTAL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  DOCK_INCOME_PER_MIN,
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
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  RADAR_SYSTEM_GOLD_UPKEEP,
  SEED_GRANARY_GROWTH_MULT,
  LONG_PEACE_MS,
  LONG_PEACE_GROWTH_MULT,
  SEED_GRANARY_SLOTS,
  POPULATION_MAX,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";
import {
  buildConnectedTownNetworkForPlayer,
  dockBaseGoldPerMinuteForPlayer,
  enrichTownWithConnectedNetwork,
  firstThreeTownsGoldOutputMultiplierForPlayer,
  firstThreeTownsPopulationGrowthMultiplierForPlayer,
  type ConnectedTownNetworkEntry,
  type EconomyPlayer
} from "./economy-network.js";
import { buildDockLinksByDockTileKey } from "./dock-network.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge.js";
import { buildTileYieldView } from "./tile-yield-view.js";

type RuntimeState = {
  tiles: Array<{
    x: number;
    y: number;
    terrain?: Terrain;
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
    chosenTrickleResource?: "IRON" | "SUPPLY" | "CRYSTAL";
    strategicResources: Partial<Record<StrategicResourceKey, number>>;
    allies: string[];
    vision: number;
    visionRadiusBonus: number;
    ownedTownTileKeys?: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    incomeMultiplier?: number;
    strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
    activeDevelopmentProcessCount?: number;
  }>;
  activeLocks?: Array<{
    commandId: string;
    playerId: string;
    actionType?: "ATTACK" | "EXPAND";
    originKey: string;
    targetKey: string;
    resolvesAt: number;
    combatResolutionJson?: string;
  }>;
  docks?: Array<{ dockId: string; tileKey: string; pairedDockId: string; connectedDockIds?: readonly string[] }>;
  tileYieldCollectedAtByTile?: Array<{ tileKey: string; collectedAt: number }>;
  playerYieldCollectionEpochByPlayer?: Array<{ playerId: string; collectedAt: number }>;
  terrainEpoch?: number;
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
  fedTownKeysByPlayer: Map<string, Set<string>>;
};

const keyFor = (x: number, y: number): string => `${x},${y}`;

const snapshotEconomyPlayer = (player: RuntimeState["players"][number] | undefined): EconomyPlayer | undefined =>
  player
    ? {
        id: player.id,
        techIds: new Set(player.techIds),
        domainIds: new Set(player.domainIds),
        mods: { attack: 1, defense: 1, income: player.incomeMultiplier ?? 1, vision: player.vision }
      }
    : undefined;

const buildFirstThreeTownKeysByPlayer = (
  runtimeState: RuntimeState
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>();
  for (const player of runtimeState.players) result.set(player.id, new Set<string>());
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const firstThree = result.get(tile.ownerId);
    if (!firstThree || firstThree.size >= 3) continue;
    firstThree.add(keyFor(tile.x, tile.y));
  }
  return result;
};

const buildFirstThreeTownKeysByPlayerAsync = async (
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, Set<string>>> => {
  const result = new Map<string, Set<string>>();
  for (const player of runtimeState.players) result.set(player.id, new Set<string>());
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const firstThree = result.get(tile.ownerId);
    if (!firstThree || firstThree.size >= 3) continue;
    firstThree.add(keyFor(tile.x, tile.y));
  }
  return result;
};

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

const toDomainTile = (tile: RuntimeState["tiles"][number], town = parseTown(tile)): DomainTileState => ({
  x: tile.x,
  y: tile.y,
  terrain: tile.terrain ?? "LAND",
  ...(tile.resource ? { resource: tile.resource as DomainTileState["resource"] } : {}),
  ...(tile.dockId ? { dockId: tile.dockId } : {}),
  ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownershipState: tile.ownershipState as DomainTileState["ownershipState"] } : {}),
  ...(town
    ? {
        town: {
          ...(town.name ? { name: town.name } : {}),
          type: town.type ?? tile.townType ?? "FARMING",
          populationTier: town.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT",
          ...(typeof town.connectedTownCount === "number" ? { connectedTownCount: town.connectedTownCount } : {}),
          ...(typeof town.connectedTownBonus === "number" ? { connectedTownBonus: town.connectedTownBonus } : {}),
          ...(Array.isArray(town.connectedTownNames) ? { connectedTownNames: town.connectedTownNames } : {})
        }
      }
    : {})
});

const buildSettledDomainTilesByPlayerId = (
  runtimeState: RuntimeState,
  domainTilesByKey: ReadonlyMap<string, DomainTileState>
): Map<string, DomainTileState[]> => {
  const byPlayerId = new Map<string, DomainTileState[]>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const domainTile = domainTilesByKey.get(keyFor(tile.x, tile.y));
    if (!domainTile) continue;
    const current = byPlayerId.get(tile.ownerId) ?? [];
    current.push(domainTile);
    byPlayerId.set(tile.ownerId, current);
  }
  return byPlayerId;
};

const buildSettledDomainTilesByPlayerIdAsync = async (
  runtimeState: RuntimeState,
  domainTilesByKey: ReadonlyMap<string, DomainTileState>,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, DomainTileState[]>> => {
  const byPlayerId = new Map<string, DomainTileState[]>();
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const domainTile = domainTilesByKey.get(keyFor(tile.x, tile.y));
    if (!domainTile) continue;
    const current = byPlayerId.get(tile.ownerId) ?? [];
    current.push(domainTile);
    byPlayerId.set(tile.ownerId, current);
  }
  return byPlayerId;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const SYNTHETIC_SETTLEMENT_POPULATION = 800;

const isSyntheticSettlementIdentity = (name: string | undefined, populationTier: NonNullable<Tile["town"]>["populationTier"], x: number, y: number): boolean =>
  populationTier === "SETTLEMENT" && name === `Settlement ${x},${y}`;

const resolvedTownPopulation = (
  town: Partial<NonNullable<Tile["town"]>> ,
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

const isCompleteTownSummary = (town: Partial<NonNullable<Tile["town"]>> | undefined): town is NonNullable<Tile["town"]> =>
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
    case "FOUNDRY": return { GOLD: FOUNDRY_GOLD_UPKEEP / 10 };
    case "CUSTOMS_HOUSE": return { GOLD: CUSTOMS_HOUSE_GOLD_UPKEEP / 10 };
    case "GARRISON_HALL": return { GOLD: GARRISON_HALL_GOLD_UPKEEP / 10 };
    case "GOVERNORS_OFFICE": return { GOLD: GOVERNORS_OFFICE_GOLD_UPKEEP / 10 };
    case "RADAR_SYSTEM": return { GOLD: RADAR_SYSTEM_GOLD_UPKEEP / 10 };
    case "AIRPORT": return { CRYSTAL: AIRPORT_CRYSTAL_UPKEEP_PER_MIN };
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
      if (!supportTileBelongsToTown(tile, x, y, ownerId, tilesByKey)) continue;
      supportMax += 1;
      if (tile.ownerId === ownerId && tile.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const EMPTY_TOWN_KEY_SET: ReadonlySet<string> = new Set<string>();
const nearbyWarTownKeysCache: WeakMap<RuntimeState, ReadonlySet<string>> = new WeakMap();

const computeTownKeysWithNearbyWar = (runtimeState: RuntimeState): ReadonlySet<string> => {
  const nowMs = Date.now();
  const result = new Set<string>();
  for (const tile of runtimeState.tiles) {
    if (tile.ownershipState !== "SETTLED" || (!tile.townJson && !tile.townType)) continue;
    const town = parseTown(tile);
    if (typeof town?.nearbyWarPausedUntil === "number" && town.nearbyWarPausedUntil > nowMs) {
      result.add(keyFor(tile.x, tile.y));
    }
  }
  return result.size > 0 ? result : EMPTY_TOWN_KEY_SET;
};

const townKeysWithNearbyWar = (runtimeState: RuntimeState): ReadonlySet<string> => {
  const cached = nearbyWarTownKeysCache.get(runtimeState);
  if (cached) return cached;
  const fresh = computeTownKeysWithNearbyWar(runtimeState);
  nearbyWarTownKeysCache.set(runtimeState, fresh);
  return fresh;
};

const hasSupportedStructure = (
  tileKey: string,
  ownerId: string,
  structureType: string | readonly string[],
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
): boolean => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const allowed = Array.isArray(structureType) ? new Set(structureType) : new Set([structureType as string]);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(tile, x, y, ownerId, tilesByKey)) continue;
      const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
      if (structure?.status === "active" && structure.type && allowed.has(structure.type)) return true;
    }
  }
  return false;
};

const supportTileBelongsToTown = (
  supportTile: RuntimeState["tiles"][number],
  townX: number,
  townY: number,
  ownerId: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
): boolean => {
  let assignedTown: RuntimeState["tiles"][number] | undefined;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = tilesByKey.get(keyFor(supportTile.x + dx, supportTile.y + dy));
      if (!candidate || candidate.ownerId !== ownerId || candidate.ownershipState !== "SETTLED") continue;
      if (!candidate.townType || candidate.townPopulationTier === "SETTLEMENT") continue;
      if (!assignedTown || candidate.x < assignedTown.x || (candidate.x === assignedTown.x && candidate.y < assignedTown.y)) {
        assignedTown = candidate;
      }
    }
  }
  return assignedTown?.x === townX && assignedTown.y === townY;
};

// Island map only changes when terrain changes (create_mountain / remove_mountain).
// Runtime stamps a fresh terrainEpoch every time terrain mutates and at each
// fresh runtime instance. We keep at most 2 recent epochs in-memory so a long-
// running process never accumulates stale maps. With WORLD_WIDTH * WORLD_HEIGHT
// up to ~256k tiles, recomputing per snapshot would be the dominant cost; this
// turns it into a one-time amortised O(world) + O(1) lookup thereafter.
const ISLAND_MAP_CACHE_LIMIT = 2;
const islandMapByEpoch = new Map<number, ReadonlyMap<string, number>>();

const computeIslandMap = (runtimeState: RuntimeState): ReadonlyMap<string, number> => {
  // Fallback to a fixed epoch in synthetic test fixtures that omit terrainEpoch;
  // the cache then degenerates to a single shared entry for the test process.
  const epoch = runtimeState.terrainEpoch ?? 0;
  const cached = islandMapByEpoch.get(epoch);
  if (cached) return cached;
  const landKeys = new Set<string>();
  for (const tile of runtimeState.tiles) {
    if (tile.terrain === "LAND") landKeys.add(keyFor(tile.x, tile.y));
  }
  const islandIdByTile = new Map<string, number>();
  let nextIslandId = 0;
  const wrap = (v: number, m: number): number => ((v % m) + m) % m;
  for (const startKey of landKeys) {
    if (islandIdByTile.has(startKey)) continue;
    const [sxRaw, syRaw] = startKey.split(",");
    const sx = Number(sxRaw);
    const sy = Number(syRaw);
    const islandId = nextIslandId;
    nextIslandId += 1;
    const queue: Array<{ x: number; y: number }> = [{ x: sx, y: sy }];
    islandIdByTile.set(startKey, islandId);
    for (let i = 0; i < queue.length; i += 1) {
      const cur = queue[i]!;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = wrap(cur.x + dx, WORLD_WIDTH);
          const ny = wrap(cur.y + dy, WORLD_HEIGHT);
          const nk = keyFor(nx, ny);
          if (!landKeys.has(nk) || islandIdByTile.has(nk)) continue;
          islandIdByTile.set(nk, islandId);
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  if (islandMapByEpoch.size >= ISLAND_MAP_CACHE_LIMIT) {
    const oldest = islandMapByEpoch.keys().next().value;
    if (oldest !== undefined) islandMapByEpoch.delete(oldest);
  }
  islandMapByEpoch.set(epoch, islandIdByTile);
  return islandIdByTile;
};

const wrappedChebyshev = (ax: number, ay: number, bx: number, by: number): number => {
  const dxRaw = Math.abs(ax - bx);
  const dyRaw = Math.abs(ay - by);
  const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
  const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
  return Math.max(dx, dy);
};

const seedGranaryBuffedCache: WeakMap<RuntimeState, Set<string>> = new WeakMap();

export const computeSeedGranaryBuffedTileKeysForTest = (runtimeState: unknown): Set<string> =>
  computeSeedGranaryBuffedTileKeys(runtimeState as RuntimeState);

const computeSeedGranaryBuffedTileKeys = (runtimeState: RuntimeState): Set<string> => {
  const cached = seedGranaryBuffedCache.get(runtimeState);
  if (cached) return cached;
  const buffed = new Set<string>();
  const islandMap = computeIslandMap(runtimeState);
  // For each player, find their SEED_GRANARY tiles, and for each, pick up to N
  // closest owned active GRANARY/SEED_GRANARY tiles on the same island.
  const ownedActiveGranariesByPlayer = new Map<string, Array<{ x: number; y: number; key: string; type: "GRANARY" | "SEED_GRANARY" }>>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const structure = parseStructure<{ type?: string; status?: string; ownerId?: string }>(tile.economicStructureJson);
    if (!structure || structure.status !== "active") continue;
    if (structure.ownerId && structure.ownerId !== tile.ownerId) continue;
    if (structure.type !== "GRANARY" && structure.type !== "SEED_GRANARY") continue;
    const list = ownedActiveGranariesByPlayer.get(tile.ownerId) ?? [];
    list.push({ x: tile.x, y: tile.y, key: keyFor(tile.x, tile.y), type: structure.type });
    ownedActiveGranariesByPlayer.set(tile.ownerId, list);
  }
  for (const [, list] of ownedActiveGranariesByPlayer) {
    const seedGranaries = list.filter((entry) => entry.type === "SEED_GRANARY");
    for (const sg of seedGranaries) {
      const sgIsland = islandMap.get(sg.key);
      if (sgIsland === undefined) continue;
      const sameIsland = list.filter((entry) => islandMap.get(entry.key) === sgIsland);
      sameIsland.sort((a, b) => {
        const da = wrappedChebyshev(sg.x, sg.y, a.x, a.y);
        const db = wrappedChebyshev(sg.x, sg.y, b.x, b.y);
        if (da !== db) return da - db;
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
      for (const entry of sameIsland.slice(0, SEED_GRANARY_SLOTS)) buffed.add(entry.key);
    }
  }
  seedGranaryBuffedCache.set(runtimeState, buffed);
  return buffed;
};

const buildFedTownKeysByPlayer = (
  runtimeState: RuntimeState,
  strategicProductionByPlayer: ReadonlyMap<string, Record<StrategicResourceKey, number>>
): Map<string, Set<string>> => {
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
  fedTownKeys: ReadonlySet<string>,
  refreshCompleteTownSummary: boolean,
  townNetwork?: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  firstThreeTownKeys?: ReadonlySet<string>,
  nearbyWarTownKeys?: ReadonlySet<string>,
  seedGranaryBuffedTileKeys?: ReadonlySet<string>
): Tile["town"] | undefined => {
  const partial = parseTown(tile);
  const townType = partial?.type ?? tile.townType;
  if (!partial && !townType) return undefined;
  const tileKey = keyFor(tile.x, tile.y);
  const populationTier = partial?.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const authoritativeTown = {
    ...(partial ?? {}),
    ...(tile.townName ? { name: tile.townName } : {}),
    ...(townType ? { type: townType } : {}),
    populationTier
  };
  const networkTown = enrichTownWithConnectedNetwork(toDomainTile(tile, authoritativeTown), townNetwork);
  const townPartial = networkTown ? { ...authoritativeTown, ...networkTown } : authoritativeTown;
  const hasCompleteAuthoritativeTown = isCompleteTownSummary(townPartial);
  const captureShockUntil = typeof townPartial.captureShockUntil === "number" ? townPartial.captureShockUntil : undefined;
  const isInCaptureShock = typeof captureShockUntil === "number" && captureShockUntil > Date.now();
  if (!refreshCompleteTownSummary && hasCompleteAuthoritativeTown && !isInCaptureShock) return townPartial;
  const isSettlement = populationTier === "SETTLEMENT";
  const support = tile.ownerId && tile.ownershipState === "SETTLED" && !isSettlement
    ? supportSummaryForTown(tileKey, tile.ownerId, tilesByKey)
    : { supportCurrent: 0, supportMax: 0 };
  const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
  const isFed = tile.ownerId ? fedTownKeys.has(tileKey) : false;
  const hasMarket = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "MARKET", tilesByKey));
  const hasGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "GRANARY", tilesByKey));
  const hasSeedGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "SEED_GRANARY", tilesByKey));
  const hasAnyGranary = hasGranary || hasSeedGranary;
  const seedGranaryBuffed = hasAnyGranary && Boolean(seedGranaryBuffedTileKeys && tile.ownerId && (() => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = keyFor(tile.x + dx, tile.y + dy);
        if (seedGranaryBuffedTileKeys.has(nk)) {
          const nTile = tilesByKey.get(nk);
          if (nTile?.ownerId === tile.ownerId) return true;
        }
      }
    }
    return false;
  })());
  const granaryGrowthMult = !hasAnyGranary ? 1 : seedGranaryBuffed ? SEED_GRANARY_GROWTH_MULT : 1.15;
  const hasBank = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "BANK", tilesByKey));
  const incomeMultiplier = player?.incomeMultiplier ?? 1;
  const economyPlayer = snapshotEconomyPlayer(player);
  const firstThreeTownMult =
    economyPlayer && firstThreeTownKeys?.has(tileKey)
      ? firstThreeTownsGoldOutputMultiplierForPlayer(economyPlayer)
      : 1;
  const firstThreeTownPopGrowthMult =
    economyPlayer && firstThreeTownKeys?.has(tileKey)
      ? firstThreeTownsPopulationGrowthMultiplierForPlayer(economyPlayer)
      : 1;
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
              (1 + (townPartial.connectedTownBonus ?? 0)) *
              (hasMarket ? 1.5 : 1) *
              (hasBank ? 1.5 : 1) *
              firstThreeTownMult *
              incomeMultiplier *
              PASSIVE_INCOME_MULT
            ) + (hasBank ? 1 : 0);
  const populationView = resolvedTownPopulation(townPartial, tile.x, tile.y, populationTier);
  if (!populationView && !hasCompleteAuthoritativeTown) return undefined;
  const population = populationView?.population ?? townPartial.population!;
  const maxPopulation = populationView?.maxPopulation ?? townPartial.maxPopulation!;
  const logisticFactor = 1 - population / Math.max(1, maxPopulation);
  const hasNearbyWar = nearbyWarTownKeys?.has(tileKey) ?? false;
  const hasLongPeace = !hasNearbyWar && (
    !townPartial.nearbyWarLastAt || Date.now() - townPartial.nearbyWarLastAt >= LONG_PEACE_MS
  );
  const naturalGrowth =
    !tile.ownerId || tile.ownershipState !== "SETTLED" || !isFed || logisticFactor <= 0
      ? 0
      : population *
        POPULATION_GROWTH_BASE_RATE *
        (populationTier === "SETTLEMENT" ? 4 : 1) *
        granaryGrowthMult *
        firstThreeTownPopGrowthMult *
        (hasLongPeace ? LONG_PEACE_GROWTH_MULT : 1) *
        logisticFactor;
  const baseGrowth = isInCaptureShock ? 0 : naturalGrowth;
  // Modifier precedence:
  //   1. Recently captured (capture-shock smoke is active even when growth is
  //      already zero, so surface the blocker explicitly instead of falling
  //      through to stale long-peace copy).
  //   2. Nearby war (negative — 60-min stamped pause from recent nearby combat).
  //   3. Long time peace (positive — 24 h of no nearby combat near this town).
  const growthModifiers = isInCaptureShock
    ? [{ label: "Recently captured" as const, deltaPerMinute: -Number(naturalGrowth.toFixed(4)) }]
    : hasNearbyWar && baseGrowth > 0
      ? [{ label: "Nearby war" as const, deltaPerMinute: -Number(baseGrowth.toFixed(4)) }]
      : hasLongPeace && baseGrowth > 0
        ? [{
            label: "Long time peace" as const,
            deltaPerMinute: Number((baseGrowth * (1 - 1 / LONG_PEACE_GROWTH_MULT)).toFixed(4))
          }]
        : [];
  const cap = isSettlement
    ? goldPerMinute * 60 * 8
    : goldPerMinute * 60 * 8 * (hasMarket ? 1.5 : 1);
  return {
    ...(townPartial.name ? { name: townPartial.name } : {}),
    type: townType!,
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
    connectedTownCount: typeof townPartial.connectedTownCount === "number" ? townPartial.connectedTownCount : 0,
    connectedTownBonus: typeof townPartial.connectedTownBonus === "number" ? townPartial.connectedTownBonus : 0,
    ...(Array.isArray(townPartial.connectedTownNames) ? { connectedTownNames: townPartial.connectedTownNames } : {}),
    hasMarket,
    marketActive: hasMarket && isFed,
    hasGranary,
    granaryActive: hasGranary,
    ...(hasSeedGranary ? { hasSeedGranary: true, seedGranaryActive: true } : {}),
    ...(seedGranaryBuffed ? { seedGranaryBuffed: true } : {}),
    hasBank,
    bankActive: hasBank,
    foodUpkeepPerMinute: townFoodUpkeepPerMinute(populationTier),
    ...(typeof captureShockUntil === "number" ? { captureShockUntil } : {}),
    ...(typeof townPartial.populationBeforeCapture === "number" ? { populationBeforeCapture: townPartial.populationBeforeCapture } : {}),
    ...(growthModifiers.length > 0 ? { growthModifiers } : {})
  };
};

export const buildLivePlayerEconomySnapshot = (
  playerId: string,
  runtimeState: RuntimeState
): LivePlayerEconomySnapshot => {
  const tilesByKey = new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const economyPlayer = snapshotEconomyPlayer(player);
  const domainTilesByKey = new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), toDomainTile(tile)] as const));
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const townNetwork = economyPlayer
    ? buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(playerId) ?? [], {
        maxConnectedTownNames: 16
      })
    : undefined;
  const firstThreeTownKeys = buildFirstThreeTownKeysByPlayer(runtimeState).get(playerId);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, strategicProductionByPlayer);
  const fedTownKeys = fedTownKeysByPlayer.get(playerId) ?? new Set<string>();
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
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
    const town = buildTownSummary(tile, player, tilesByKey, fedTownKeys, true, townNetwork, firstThreeTownKeys, nearbyWarTownKeys, seedGranaryBuffedTileKeys);
    if (town && town.goldPerMinute > 0) addBucket(goldSources, "Towns", town.goldPerMinute, { count: 1 });
    if (town && (town.foodUpkeepPerMinute ?? 0) > 0) addBucket(foodSinks, "Town", town.foodUpkeepPerMinute ?? 0, { count: 1 });
    if (tile.dockId) {
      const dockGoldPerMinute = economyPlayer
        ? dockBaseGoldPerMinuteForPlayer(toDomainTile(tile), economyPlayer, { tiles: domainTilesByKey, dockLinksByDockTileKey }) *
          (player?.incomeMultiplier ?? 1) *
          PASSIVE_INCOME_MULT
        : DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT;
      addBucket(goldSources, "Docks", dockGoldPerMinute, { count: 1 });
    }
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

  // Clockwork Stipend (and any future pick-a-resource domain) credits a flat
  // trickle each tick — fold it into the breakdown so the income panel
  // attributes it, matching buildPlayerUpdateEconomySnapshot.
  const trickle = player
    ? chosenTrickleRateForPlayer({ domainIds: new Set(player.domainIds), chosenTrickleResource: player.chosenTrickleResource })
    : undefined;
  if (trickle && trickle.ratePerMinute > 0) {
    const target =
      trickle.resource === "IRON" ? ironSources :
      trickle.resource === "SUPPLY" ? supplySources :
      crystalSources;
    addBucket(target, "Clockwork Stipend", trickle.ratePerMinute, { count: 1, resourceKey: trickle.resource });
    strategicProductionPerMinute[trickle.resource] += trickle.ratePerMinute;
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
    fedTownKeys,
    fedTownKeysByPlayer
  };
};

const toSharedVisibilityTownSummary = (town: DomainTileState["town"] | undefined): DomainTileState["town"] | undefined => {
  if (!town) return undefined;
  return {
    ...(town.name ? { name: town.name } : {}),
    type: town.type,
    populationTier: town.populationTier,
    ...(typeof town.population === "number" ? { population: town.population } : {}),
    ...(typeof town.maxPopulation === "number" ? { maxPopulation: town.maxPopulation } : {}),
    ...(typeof town.connectedTownCount === "number" ? { connectedTownCount: town.connectedTownCount } : {}),
    ...(typeof town.connectedTownBonus === "number" ? { connectedTownBonus: town.connectedTownBonus } : {}),
    ...(Array.isArray(town.connectedTownNames) ? { connectedTownNames: town.connectedTownNames } : {})
  } as DomainTileState["town"];
};

const buildSnapshotTileYieldFields = (
  tile: RuntimeState["tiles"][number],
  collectedAtByTile: ReadonlyMap<string, number>,
  playerYieldCollectionEpochByPlayer: ReadonlyMap<string, number>,
  town: DomainTileState["town"] | undefined,
  context?: {
    player?: EconomyPlayer | undefined;
    fedTownKeys?: ReadonlySet<string> | undefined;
    firstThreeTownKeys?: ReadonlySet<string> | undefined;
    tiles: ReadonlyMap<string, DomainTileState>;
    dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  }
) => {
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
  const tileAnchor = collectedAtByTile.get(keyFor(tile.x, tile.y));
  const playerAnchor = tile.ownerId ? playerYieldCollectionEpochByPlayer.get(tile.ownerId) : undefined;
  const collectedAt =
    typeof tileAnchor === "number" && typeof playerAnchor === "number" ? Math.max(tileAnchor, playerAnchor) : tileAnchor ?? playerAnchor;
  const yieldView = buildTileYieldView(yieldTile, collectedAt, Date.now(), context);
  return {
    ...(yieldView?.yield ? { yield: yieldView.yield } : {})
    // yieldRate and yieldCap are derived client-side from static yield tables
    // + townJson (goldPerMinute/cap). See packages/client/src/yield-derivation.ts.
  };
};

export const enrichSnapshotTilesForGlobalVisibility = (
  runtimeState: RuntimeState
): RuntimeState["tiles"] => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const playerYieldCollectionEpochByPlayer = new Map(
    (runtimeState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt] as const)
  );
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  const domainTilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), toDomainTile(entry)] as const));
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const townNetworksByPlayerId = new Map(
    [...economyPlayersById].map(([id, economyPlayer]) => [
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16
      })
    ] as const)
  );
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, strategicProductionByPlayer);
  return [...runtimeState.tiles]
    .sort((left, right) => (left.x - right.x) || (left.y - right.y))
    .map((tile) => {
      const player = tile.ownerId ? playersById.get(tile.ownerId) : undefined;
      const economyPlayer = tile.ownerId ? economyPlayersById.get(tile.ownerId) : undefined;
      const fedTownKeys = tile.ownerId ? (fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) : new Set<string>();
      const fullTown = buildTownSummary(
        tile,
        player,
        tilesByKey,
        fedTownKeys,
        true,
        tile.ownerId ? townNetworksByPlayerId.get(tile.ownerId) : undefined,
        tile.ownerId ? firstThreeTownKeysByPlayer.get(tile.ownerId) : undefined,
        nearbyWarTownKeys,
        computeSeedGranaryBuffedTileKeys(runtimeState)
      );
      const town = toSharedVisibilityTownSummary(fullTown);
      const yieldFields = buildSnapshotTileYieldFields(tile, collectedAtByTile, playerYieldCollectionEpochByPlayer, fullTown, {
        ...(economyPlayer ? { player: economyPlayer } : {}),
        fedTownKeys,
        ...(tile.ownerId ? { firstThreeTownKeys: firstThreeTownKeysByPlayer.get(tile.ownerId) } : {}),
        tiles: domainTilesByKey,
        dockLinksByDockTileKey
      });
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

// Per-tile builder shared by sync + async variants. The 2026-05-20 stall
// traced into this map: `runtimeState.players.find` is O(P) per tile and
// buildTownSummary/buildSnapshotTileYieldFields are non-trivial, so 2000+
// visible tiles blocked the main thread for tens of seconds.
type EnrichmentContext = {
  collectedAtByTile: Map<string, number>;
  playerYieldCollectionEpochByPlayer: Map<string, number>;
  tilesByKey: Map<string, RuntimeState["tiles"][number]>;
  domainTilesByKey: Map<string, DomainTileState>;
  dockLinksByDockTileKey: ReturnType<typeof buildDockLinksByDockTileKey>;
  economyPlayersById: Map<string, NonNullable<ReturnType<typeof snapshotEconomyPlayer>>>;
  townNetworksByPlayerId: Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>;
  firstThreeTownKeysByPlayer: ReturnType<typeof buildFirstThreeTownKeysByPlayer>;
  nearbyWarTownKeys: ReturnType<typeof townKeysWithNearbyWar>;
  fedTownKeysByPlayer: LivePlayerEconomySnapshot["fedTownKeysByPlayer"];
  fedTownKeys: LivePlayerEconomySnapshot["fedTownKeys"];
  seedGranaryBuffedTileKeys: ReadonlySet<string>;
};

const buildEnrichmentContext = (
  runtimeState: RuntimeState,
  playerEconomy: LivePlayerEconomySnapshot,
  visibleTiles: RuntimeState["tiles"]
): EnrichmentContext => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const playerYieldCollectionEpochByPlayer = new Map(
    (runtimeState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt] as const)
  );
  const tilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), entry] as const));
  const domainTilesByKey = new Map(runtimeState.tiles.map((entry) => [keyFor(entry.x, entry.y), toDomainTile(entry)] as const));
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const visibleOwnerIds = new Set(visibleTiles.map((tile) => tile.ownerId).filter((id): id is string => Boolean(id)));
  const townNetworksByPlayerId = new Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>();
  for (const id of visibleOwnerIds) {
    const economyPlayer = economyPlayersById.get(id);
    if (!economyPlayer) continue;
    townNetworksByPlayerId.set(
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16
      })
    );
  }
  const firstThreeTownKeysByPlayer = buildFirstThreeTownKeysByPlayer(runtimeState);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  return {
    collectedAtByTile,
    playerYieldCollectionEpochByPlayer,
    tilesByKey,
    domainTilesByKey,
    dockLinksByDockTileKey,
    economyPlayersById,
    townNetworksByPlayerId,
    firstThreeTownKeysByPlayer,
    nearbyWarTownKeys,
    fedTownKeysByPlayer: playerEconomy.fedTownKeysByPlayer,
    fedTownKeys: playerEconomy.fedTownKeys,
    seedGranaryBuffedTileKeys
  };
};

const buildEnrichmentContextAsync = async (
  runtimeState: RuntimeState,
  playerEconomy: LivePlayerEconomySnapshot,
  visibleTiles: RuntimeState["tiles"],
  yieldToEventLoop: () => Promise<void>
): Promise<EnrichmentContext> => {
  const collectedAtByTile = new Map((runtimeState.tileYieldCollectedAtByTile ?? []).map((entry) => [entry.tileKey, entry.collectedAt] as const));
  const playerYieldCollectionEpochByPlayer = new Map(
    (runtimeState.playerYieldCollectionEpochByPlayer ?? []).map((entry) => [entry.playerId, entry.collectedAt] as const)
  );
  const tilesByKey = new Map<string, RuntimeState["tiles"][number]>();
  const domainTilesByKey = new Map<string, DomainTileState>();
  let tileIndex = 0;
  for (const entry of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    const tileKey = keyFor(entry.x, entry.y);
    tilesByKey.set(tileKey, entry);
    domainTilesByKey.set(tileKey, toDomainTile(entry));
  }
  const settledDomainTilesByPlayerId = await buildSettledDomainTilesByPlayerIdAsync(runtimeState, domainTilesByKey, yieldToEventLoop);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const economyPlayersById = new Map(runtimeState.players.map((entry) => [entry.id, snapshotEconomyPlayer(entry)!] as const));
  const visibleOwnerIds = new Set(visibleTiles.map((tile) => tile.ownerId).filter((id): id is string => Boolean(id)));
  const townNetworksByPlayerId = new Map<string, ReturnType<typeof buildConnectedTownNetworkForPlayer>>();
  for (const id of visibleOwnerIds) {
    const economyPlayer = economyPlayersById.get(id);
    if (!economyPlayer) continue;
    townNetworksByPlayerId.set(
      id,
      buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(id) ?? [], {
        maxConnectedTownNames: 16
      })
    );
    await yieldToEventLoop();
  }
  const firstThreeTownKeysByPlayer = await buildFirstThreeTownKeysByPlayerAsync(runtimeState, yieldToEventLoop);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  await yieldToEventLoop();
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  await yieldToEventLoop();
  return {
    collectedAtByTile,
    playerYieldCollectionEpochByPlayer,
    tilesByKey,
    domainTilesByKey,
    dockLinksByDockTileKey,
    economyPlayersById,
    townNetworksByPlayerId,
    firstThreeTownKeysByPlayer,
    nearbyWarTownKeys,
    fedTownKeysByPlayer: playerEconomy.fedTownKeysByPlayer,
    fedTownKeys: playerEconomy.fedTownKeys,
    seedGranaryBuffedTileKeys
  };
};

const buildEnrichedTile = (
  playerId: string,
  tile: RuntimeState["tiles"][number],
  ctx: EnrichmentContext,
  playersById: Map<string, RuntimeState["players"][number]>
): RuntimeState["tiles"][number] => {
  // Linear `players.find` was O(P) per tile; pre-indexed lookup is O(1).
  const player = tile.ownerId ? playersById.get(tile.ownerId) : undefined;
  const economyPlayer = tile.ownerId ? ctx.economyPlayersById.get(tile.ownerId) : undefined;
  const town = buildTownSummary(
    tile,
    player,
    ctx.tilesByKey,
    tile.ownerId === playerId ? ctx.fedTownKeys : (tile.ownerId ? (ctx.fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) : new Set<string>()),
    tile.ownerId === playerId,
    tile.ownerId ? ctx.townNetworksByPlayerId.get(tile.ownerId) : undefined,
    tile.ownerId ? ctx.firstThreeTownKeysByPlayer.get(tile.ownerId) : undefined,
    ctx.nearbyWarTownKeys,
    ctx.seedGranaryBuffedTileKeys
  );
  const yieldFields = buildSnapshotTileYieldFields(tile, ctx.collectedAtByTile, ctx.playerYieldCollectionEpochByPlayer, town, {
    ...(economyPlayer ? { player: economyPlayer } : {}),
    ...(tile.ownerId
      ? { fedTownKeys: tile.ownerId === playerId ? ctx.fedTownKeys : (ctx.fedTownKeysByPlayer.get(tile.ownerId) ?? new Set<string>()) }
      : {}),
    ...(tile.ownerId ? { firstThreeTownKeys: ctx.firstThreeTownKeysByPlayer.get(tile.ownerId) } : {}),
    tiles: ctx.domainTilesByKey,
    dockLinksByDockTileKey: ctx.dockLinksByDockTileKey
  });
  if (!town) return { ...tile, ...yieldFields };
  return {
    ...tile,
    townJson: JSON.stringify(town),
    townType: town.type,
    ...(town.name ? { townName: town.name } : {}),
    townPopulationTier: town.populationTier,
    ...yieldFields
  };
};

export const enrichSnapshotTilesForPlayer = (
  playerId: string,
  runtimeState: RuntimeState,
  visibleTiles: RuntimeState["tiles"],
  playerEconomy: LivePlayerEconomySnapshot
): RuntimeState["tiles"] => {
  const ctx = buildEnrichmentContext(runtimeState, playerEconomy, visibleTiles);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  return visibleTiles.map((tile) => buildEnrichedTile(playerId, tile, ctx, playersById));
};

// Async variant that yields to the event loop every ENRICHMENT_YIELD_CHUNK
// tiles so a multi-second per-player snapshot build no longer blocks the
// main thread for its full duration. Output is identical to the sync version
// for the same inputs (covered by a parity test).
//
// Chunk size 100 chosen so each contiguous block (≈1.4s at 13.6ms/tile
// observed in the 2026-05-20 prod outage) stays well under Fly's 5s healthz
// timeout and the gateway sim-ping 10s budget. setImmediate overhead at this
// scale (~20 extra hops per 2000-tile build) is negligible.
const ENRICHMENT_YIELD_CHUNK = 100;

export const enrichSnapshotTilesForPlayerAsync = async (
  playerId: string,
  runtimeState: RuntimeState,
  visibleTiles: RuntimeState["tiles"],
  playerEconomy: LivePlayerEconomySnapshot,
  yieldToEventLoop: () => Promise<void>
): Promise<RuntimeState["tiles"]> => {
  const ctx = await buildEnrichmentContextAsync(runtimeState, playerEconomy, visibleTiles, yieldToEventLoop);
  const playersById = new Map(runtimeState.players.map((entry) => [entry.id, entry] as const));
  const out: RuntimeState["tiles"] = new Array(visibleTiles.length);
  for (let i = 0; i < visibleTiles.length; i += 1) {
    out[i] = buildEnrichedTile(playerId, visibleTiles[i]!, ctx, playersById);
    if (i > 0 && i % ENRICHMENT_YIELD_CHUNK === 0) {
      await yieldToEventLoop();
    }
  }
  return out;
};
