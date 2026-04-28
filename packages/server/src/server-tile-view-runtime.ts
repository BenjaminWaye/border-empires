import type {
  ClusterType,
  Dock,
  EconomicStructure,
  Fort,
  Observatory,
  OwnershipState,
  Player,
  PopulationTier,
  ResourceType,
  RegionType,
  SiegeOutpost,
  Terrain,
  Tile,
  TileKey
} from "@border-empires/shared";

import type { ClusterDefinition, RuntimeTileCore, StrategicResource, TileYieldBuffer, TownDefinition } from "./server-shared-types.js";

export interface CreateServerTileViewRuntimeDeps {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  PASSIVE_INCOME_MULT: number;
  HARVEST_GOLD_RATE_MULT: number;
  SIPHON_SHARE: number;
  SETTLEMENT_BASE_GOLD_PER_MIN: number;
  TOWN_BASE_GOLD_PER_MIN: number;
  BARBARIAN_OWNER_ID: string;
  key: (x: number, y: number) => TileKey;
  now: () => number;
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  terrainAtRuntime: (x: number, y: number) => Terrain;
  resourceAt: (x: number, y: number) => ResourceType | undefined;
  applyClusterResources: (x: number, y: number, resource: ResourceType | undefined) => ResourceType | undefined;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  docksByTile: Map<TileKey, Dock>;
  townsByTile: Map<TileKey, TownDefinition>;
  fortsByTile: Map<TileKey, Fort>;
  observatoriesByTile: Map<TileKey, Observatory>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  breachShockByTile: Map<TileKey, { ownerId: string; expiresAt: number }>;
  siphonByTile: Map<TileKey, { casterPlayerId: string; endsAt: number }>;
  tileHistoryByTile: Map<TileKey, NonNullable<Tile["history"]>>;
  tileYieldByTile: Map<TileKey, TileYieldBuffer>;
  players: Map<string, Player>;
  resourceRate: Record<ResourceType, number>;
  strategicDailyFromResource: Partial<Record<ResourceType, number>>;
  parseKey: (tileKey: TileKey) => [number, number];
  activeSettlementTileKeyForPlayer: (playerId: string) => TileKey | undefined;
  townSupport: (townKey: TileKey, ownerId: string) => { supportCurrent: number; supportMax: number };
  townPopulationTierForTown: (town: TownDefinition) => PopulationTier;
  isTownFedForOwner: (townKey: TileKey, ownerId: string | undefined) => boolean;
  townGoldIncomeEnabledForPlayer: (player: Player) => boolean;
  effectiveManpowerAt: (player: Player) => number;
  playerManpowerCap: (player: Player) => number;
  structureForSupportedTown: (townKey: TileKey, ownerId: string | undefined, type: string) => EconomicStructure | undefined;
  directlyConnectedTownKeysForTown: (ownerId: string, townKey: TileKey) => TileKey[];
  prettyTownName: (town: TownDefinition) => string;
  townIncomeForOwner: (town: TownDefinition, ownerId: string | undefined) => number;
  townCapForOwner: (town: TownDefinition, ownerId: string | undefined) => number;
  townPopulationGrowthPerMinuteForOwner: (town: TownDefinition, ownerId: string | undefined) => number;
  townFoodUpkeepPerMinute: (town: TownDefinition) => number;
  townGrowthModifiersForOwner: (
    town: TownDefinition,
    ownerId: string | undefined
  ) => NonNullable<Tile["town"]>["growthModifiers"];
  dockSummaryForOwner: (dock: Dock, ownerId: string | undefined) => Tile["dock"] | undefined;
  dockIncomeForOwner: (dock: Dock, ownerId: string) => number;
  shardSiteViewAt: (tileKey: TileKey) => Tile["shardSite"];
  regionTypeAtLocal: (x: number, y: number) => RegionType | undefined;
  observatoryStatusForTile: (ownerId: string, tileKey: TileKey) => NonNullable<Tile["observatory"]>["status"];
  siphonMultiplierAt: (tileKey: TileKey) => number;
  toStrategicResource: (resource: ResourceType | undefined) => StrategicResource | undefined;
  activeResourceIncomeMult: (playerId: string, resource: ResourceType) => number;
  economicStructureOutputMultAt: (tileKey: TileKey, ownerId: string) => number;
  converterStructureOutputFor: (structureType: string, ownerId: string) => Partial<Record<StrategicResource, number>> | undefined;
  tileYieldCapsFor: (tileKey: TileKey, ownerId: string | undefined) => { gold: number; strategicEach: number };
  roundedPositiveStrategic: (strategic: Record<StrategicResource, number>) => Partial<Record<StrategicResource, number>>;
  hasPositiveStrategicBuffer: (strategic: Partial<Record<StrategicResource, number>>) => boolean;
  continentIdAt: (x: number, y: number) => number | undefined;
  tileUpkeepEntriesForTile: (
    tileKey: TileKey,
    ownerId: string | undefined
  ) => NonNullable<Tile["upkeepEntries"]>;
}

export interface ServerTileViewRuntime {
  runtimeTileCore: (x: number, y: number) => RuntimeTileCore;
  aiTileLiteAt: (x: number, y: number) => Tile;
  buildTownSummaryForTile: (town: TownDefinition, ownerId: string | undefined, includeConnectedTownNames: boolean) => NonNullable<Tile["town"]>;
  thinTownSummaryForTile: (town: TownDefinition, ownerId: string | undefined) => NonNullable<Tile["town"]>;
  townSummaryForTile: (town: TownDefinition, ownerId: string | undefined) => NonNullable<Tile["town"]>;
  applyTileYieldSummary: (
    tile: Tile,
    wx: number,
    wy: number,
    ownerId: string | undefined,
    ownershipState: OwnershipState | undefined,
    resource: ResourceType | undefined,
    dock: Dock | undefined,
    town: TownDefinition | undefined,
    terrain: Terrain
  ) => void;
  playerTile: (x: number, y: number) => Tile;
  cardinalNeighborCores: (x: number, y: number) => RuntimeTileCore[];
  adjacentNeighborCores: (x: number, y: number) => RuntimeTileCore[];
}

export const createServerTileViewRuntime = (deps: CreateServerTileViewRuntimeDeps): ServerTileViewRuntime => {
  const runtimeTileCore = (x: number, y: number): RuntimeTileCore => {
    const wx = deps.wrapX(x, deps.WORLD_WIDTH);
    const wy = deps.wrapY(y, deps.WORLD_HEIGHT);
    const tileKey = deps.key(wx, wy);
    const terrain = deps.terrainAtRuntime(wx, wy);
    const ownerId = deps.ownership.get(tileKey);
    const ownershipState = ownerId
      ? (deps.ownershipStateByTile.get(tileKey) ?? (ownerId === deps.BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED"))
      : undefined;
    const resource = terrain === "LAND" ? deps.applyClusterResources(wx, wy, deps.resourceAt(wx, wy)) : undefined;
    return { x: wx, y: wy, tileKey, terrain, ownerId, ownershipState, resource };
  };

  const buildTownSummaryForTile = (
    town: TownDefinition,
    ownerId: string | undefined,
    includeConnectedTownNames: boolean
  ): NonNullable<Tile["town"]> => {
    const support = ownerId ? deps.townSupport(town.tileKey, ownerId) : { supportCurrent: 0, supportMax: 0 };
    const tier = deps.townPopulationTierForTown(town);
    const isFed = deps.isTownFedForOwner(town.tileKey, ownerId);
    const owner = ownerId ? deps.players.get(ownerId) : undefined;
    const manpowerGoldPaused = Boolean(owner && !deps.townGoldIncomeEnabledForPlayer(owner));
    const market = deps.structureForSupportedTown(town.tileKey, ownerId, "MARKET");
    const granary = deps.structureForSupportedTown(town.tileKey, ownerId, "GRANARY");
    const bank = deps.structureForSupportedTown(town.tileKey, ownerId, "BANK");
    const connectedTownKeys = includeConnectedTownNames && ownerId ? deps.directlyConnectedTownKeysForTown(ownerId, town.tileKey) : [];
    const summary: NonNullable<Tile["town"]> = {
      name: deps.prettyTownName(town),
      type: town.type,
      baseGoldPerMinute:
        tier === "SETTLEMENT" ? deps.SETTLEMENT_BASE_GOLD_PER_MIN : deps.TOWN_BASE_GOLD_PER_MIN,
      supportCurrent: support.supportCurrent,
      supportMax: support.supportMax,
      goldPerMinute: deps.townIncomeForOwner(town, ownerId),
      cap: deps.townCapForOwner(town, ownerId),
      isFed,
      population: town.population,
      maxPopulation: town.maxPopulation,
      populationGrowthPerMinute: deps.townPopulationGrowthPerMinuteForOwner(town, ownerId),
      populationTier: deps.townPopulationTierForTown(town),
      connectedTownCount: town.connectedTownCount,
      connectedTownBonus: town.connectedTownBonus,
      connectedTownNames: connectedTownKeys
        .map((townKey) => deps.townsByTile.get(townKey))
        .map((connectedTown) => (connectedTown ? deps.prettyTownName(connectedTown) : undefined))
        .filter((label): label is string => Boolean(label)),
      ...(manpowerGoldPaused && owner
        ? {
            goldIncomePausedReason: "MANPOWER_NOT_FULL" as const,
            manpowerCurrent: Math.round(deps.effectiveManpowerAt(owner)),
            manpowerCap: Math.round(deps.playerManpowerCap(owner))
          }
        : {}),
      hasMarket: Boolean(market),
      marketActive: Boolean(market && market.status === "active" && isFed),
      hasGranary: Boolean(granary),
      granaryActive: Boolean(granary && granary.status === "active"),
      hasBank: Boolean(bank),
      bankActive: Boolean(bank && bank.status === "active"),
      foodUpkeepPerMinute: deps.townFoodUpkeepPerMinute(town)
    };
    const growthModifiers = deps.townGrowthModifiersForOwner(town, ownerId);
    if (growthModifiers) summary.growthModifiers = growthModifiers;
    return summary;
  };

  const thinTownSummaryForTile = (town: TownDefinition, ownerId: string | undefined): NonNullable<Tile["town"]> =>
    buildTownSummaryForTile(town, ownerId, false);

  const townSummaryForTile = (town: TownDefinition, ownerId: string | undefined): NonNullable<Tile["town"]> =>
    buildTownSummaryForTile(town, ownerId, true);

  const applyTileYieldSummary = (
    tile: Tile,
    wx: number,
    wy: number,
    ownerId: string | undefined,
    ownershipState: OwnershipState | undefined,
    resource: ResourceType | undefined,
    dock: Dock | undefined,
    town: TownDefinition | undefined,
    terrain: Terrain
  ): void => {
    const tileKey = deps.key(wx, wy);
    const yieldBuffer = deps.tileYieldByTile.get(tileKey);
    if (dock) {
      const dockSummary = deps.dockSummaryForOwner(dock, ownerId);
      if (dockSummary) tile.dock = dockSummary;
      else delete tile.dock;
    } else {
      delete tile.dock;
    }
    if (ownerId && ownershipState === "SETTLED" && terrain === "LAND") {
      const sabotageMult = deps.siphonMultiplierAt(tileKey);
      const goldPerMinuteFromTile =
        ((resource ? (deps.resourceRate[resource] ?? 0) * sabotageMult : 0) +
          (dock ? deps.dockIncomeForOwner(dock, ownerId) : 0) +
          (town ? deps.townIncomeForOwner(town, ownerId) * sabotageMult : 0)) *
        (deps.players.get(ownerId)?.mods.income ?? 1) *
        deps.PASSIVE_INCOME_MULT *
        deps.HARVEST_GOLD_RATE_MULT;
      const strategicPerDay: Partial<Record<StrategicResource, number>> = {};
      const strategicResource = deps.toStrategicResource(resource);
      if (strategicResource && resource) {
        const mult = deps.activeResourceIncomeMult(ownerId, resource);
        strategicPerDay[strategicResource] =
          (deps.strategicDailyFromResource[resource] ?? 0) *
          mult *
          sabotageMult *
          deps.economicStructureOutputMultAt(tileKey, ownerId);
      }
      const economicStructure = deps.economicStructuresByTile.get(tileKey);
      if (economicStructure && economicStructure.ownerId === ownerId && economicStructure.status === "active") {
        const converterDaily = deps.converterStructureOutputFor(economicStructure.type, ownerId);
        if (converterDaily) {
          for (const [resourceKey, amount] of Object.entries(converterDaily) as Array<[StrategicResource, number]>) {
            strategicPerDay[resourceKey] = (strategicPerDay[resourceKey] ?? 0) + amount;
          }
        }
      }
      (tile as Tile & { yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResource, number>> } }).yieldRate = {
        goldPerMinute: Number(goldPerMinuteFromTile.toFixed(4)),
        strategicPerDay
      };
    }
    (tile as Tile & { yieldCap?: { gold: number; strategicEach: number } }).yieldCap = deps.tileYieldCapsFor(tileKey, ownerId);
    if (yieldBuffer && ownerId) {
      const strategic = deps.roundedPositiveStrategic(yieldBuffer.strategic);
      if (yieldBuffer.gold > 0 || deps.hasPositiveStrategicBuffer(yieldBuffer.strategic)) {
        (tile as Tile & { yield?: { gold: number; strategic: Partial<Record<StrategicResource, number>> } }).yield = {
          gold: Number(yieldBuffer.gold.toFixed(3)),
          strategic
        };
      }
    }
  };

  const aiTileLiteAt = (x: number, y: number): Tile => {
    const core = runtimeTileCore(x, y);
    const tile: Tile = { x: core.x, y: core.y, terrain: core.terrain, lastChangedAt: 0 };
    if (core.resource) tile.resource = core.resource;
    if (core.ownerId) tile.ownerId = core.ownerId;
    if (core.ownershipState) tile.ownershipState = core.ownershipState;
    const tileKey = core.tileKey;
    const dock = deps.docksByTile.get(tileKey);
    if (dock) tile.dockId = dock.dockId;
    const town = deps.townsByTile.get(tileKey);
    if (town) tile.town = thinTownSummaryForTile(town, core.ownerId);
    const fort = deps.fortsByTile.get(tileKey);
    if (fort) tile.fort = { ownerId: fort.ownerId, status: fort.status, ...(fort.completesAt !== undefined ? { completesAt: fort.completesAt } : {}), ...(fort.disabledUntil !== undefined ? { disabledUntil: fort.disabledUntil } : {}) };
    const observatory = deps.observatoriesByTile.get(tileKey);
    if (observatory) tile.observatory = { ownerId: observatory.ownerId, status: observatory.status, ...(observatory.completesAt !== undefined ? { completesAt: observatory.completesAt } : {}), ...(observatory.cooldownUntil !== undefined ? { cooldownUntil: observatory.cooldownUntil } : {}) };
    const siegeOutpost = deps.siegeOutpostsByTile.get(tileKey);
    if (siegeOutpost) tile.siegeOutpost = { ownerId: siegeOutpost.ownerId, status: siegeOutpost.status, ...(siegeOutpost.completesAt !== undefined ? { completesAt: siegeOutpost.completesAt } : {}) };
    const economic = deps.economicStructuresByTile.get(tileKey);
    if (economic) {
      tile.economicStructure = {
        ownerId: economic.ownerId,
        type: economic.type,
        status: economic.status,
        ...(economic.inactiveReason !== undefined ? { inactiveReason: economic.inactiveReason } : {}),
        ...(economic.disabledUntil !== undefined ? { disabledUntil: economic.disabledUntil } : {}),
        ...(economic.completesAt !== undefined ? { completesAt: economic.completesAt } : {})
      };
    }
    return tile;
  };

  const playerTile = (x: number, y: number): Tile => {
    const wx = deps.wrapX(x, deps.WORLD_WIDTH);
    const wy = deps.wrapY(y, deps.WORLD_HEIGHT);
    const tileKey = deps.key(wx, wy);
    const terrain = deps.terrainAtRuntime(wx, wy);
    const baseResource = terrain === "LAND" ? deps.resourceAt(wx, wy) : undefined;
    const resource = terrain === "LAND" ? deps.applyClusterResources(wx, wy, baseResource) : undefined;
    const ownerId = deps.ownership.get(tileKey);
    const ownershipState = deps.ownershipStateByTile.get(tileKey);
    const clusterId = deps.clusterByTile.get(tileKey);
    const clusterType: ClusterType | undefined = clusterId ? deps.clustersById.get(clusterId)?.clusterType : undefined;
    const dock = terrain === "LAND" ? deps.docksByTile.get(tileKey) : undefined;
    const shardSite = terrain === "LAND" ? deps.shardSiteViewAt(tileKey) : undefined;
    const town = terrain === "LAND" ? deps.townsByTile.get(tileKey) : undefined;
    const fort = terrain === "LAND" ? deps.fortsByTile.get(tileKey) : undefined;
    const observatory = terrain === "LAND" ? deps.observatoriesByTile.get(tileKey) : undefined;
    const siegeOutpost = terrain === "LAND" ? deps.siegeOutpostsByTile.get(tileKey) : undefined;
    const sabotage = deps.siphonByTile.get(tileKey);
    const breachShock = deps.breachShockByTile.get(tileKey);
    const history = deps.tileHistoryByTile.get(tileKey);
    const tile: Tile = { x: wx, y: wy, terrain, detailLevel: "full", lastChangedAt: deps.now() };
    const continentId = deps.continentIdAt(wx, wy);
    const regionType = deps.regionTypeAtLocal(wx, wy);
    if (resource && !dock) tile.resource = resource;
    if (ownerId) {
      tile.ownerId = ownerId;
      tile.ownershipState = ownershipState ?? (ownerId === deps.BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
      if (ownerId !== deps.BARBARIAN_OWNER_ID && deps.activeSettlementTileKeyForPlayer(ownerId) === tileKey) tile.capital = true;
    }
    if (continentId !== undefined) tile.continentId = continentId;
    if (terrain === "LAND" && regionType) (tile as Tile & { regionType?: string }).regionType = regionType;
    if (terrain === "LAND" && clusterId) tile.clusterId = clusterId;
    if (terrain === "LAND" && clusterType) tile.clusterType = clusterType;
    if (dock) tile.dockId = dock.dockId;
    if (terrain === "LAND") tile.shardSite = shardSite ?? null;
    if (breachShock && breachShock.expiresAt > deps.now() && ownerId === breachShock.ownerId) tile.breachShockUntil = breachShock.expiresAt;
    if (town) tile.town = townSummaryForTile(town, ownerId);
    if (fort) tile.fort = { ownerId: fort.ownerId, status: fort.status, ...((fort.status === "under_construction" || fort.status === "removing") && fort.completesAt !== undefined ? { completesAt: fort.completesAt } : {}), ...(fort.disabledUntil !== undefined ? { disabledUntil: fort.disabledUntil } : {}) };
    if (observatory) tile.observatory = { ownerId: observatory.ownerId, status: deps.observatoryStatusForTile(observatory.ownerId, observatory.tileKey), ...(observatory.cooldownUntil !== undefined ? { cooldownUntil: observatory.cooldownUntil } : {}), ...(((observatory.status === "under_construction" || observatory.status === "removing") && observatory.completesAt !== undefined) ? { completesAt: observatory.completesAt } : {}) };
    if (siegeOutpost) tile.siegeOutpost = { ownerId: siegeOutpost.ownerId, status: siegeOutpost.status, ...((siegeOutpost.status === "under_construction" || siegeOutpost.status === "removing") && siegeOutpost.completesAt !== undefined ? { completesAt: siegeOutpost.completesAt } : {}) };
    if (sabotage && sabotage.endsAt > deps.now()) tile.sabotage = { ownerId: sabotage.casterPlayerId, endsAt: sabotage.endsAt, outputMultiplier: 1 - deps.SIPHON_SHARE };
    const economicStructure = deps.economicStructuresByTile.get(tileKey);
    if (economicStructure) {
      tile.economicStructure = {
        ownerId: economicStructure.ownerId,
        type: economicStructure.type,
        status: economicStructure.status,
        ...(economicStructure.inactiveReason !== undefined ? { inactiveReason: economicStructure.inactiveReason } : {}),
        ...(economicStructure.disabledUntil !== undefined ? { disabledUntil: economicStructure.disabledUntil } : {}),
        ...((economicStructure.status === "under_construction" || economicStructure.status === "removing") && economicStructure.completesAt !== undefined ? { completesAt: economicStructure.completesAt } : {})
      };
    }
    if (history && (history.captureCount > 0 || history.structureHistory.length > 0 || history.lastStructureType)) {
      tile.history = {
        previousOwners: [...history.previousOwners],
        captureCount: history.captureCount,
        structureHistory: [...history.structureHistory],
        ...(history.lastOwnerId !== undefined ? { lastOwnerId: history.lastOwnerId } : {}),
        ...(history.lastCapturedAt !== undefined ? { lastCapturedAt: history.lastCapturedAt } : {}),
        ...(history.lastStructureType !== undefined ? { lastStructureType: history.lastStructureType } : {})
      };
    }
    const upkeepEntries = deps.tileUpkeepEntriesForTile(tileKey, ownerId);
    if (upkeepEntries.length > 0) tile.upkeepEntries = upkeepEntries;
    applyTileYieldSummary(tile, wx, wy, ownerId, ownershipState, resource, dock, town, terrain);
    return tile;
  };

  const cardinalNeighborCores = (x: number, y: number): RuntimeTileCore[] => [
    runtimeTileCore(x, y - 1),
    runtimeTileCore(x + 1, y),
    runtimeTileCore(x, y + 1),
    runtimeTileCore(x - 1, y)
  ];

  const adjacentNeighborCores = (x: number, y: number): RuntimeTileCore[] => [
    runtimeTileCore(x, y - 1),
    runtimeTileCore(x + 1, y),
    runtimeTileCore(x, y + 1),
    runtimeTileCore(x - 1, y),
    runtimeTileCore(x - 1, y - 1),
    runtimeTileCore(x + 1, y - 1),
    runtimeTileCore(x + 1, y + 1),
    runtimeTileCore(x - 1, y + 1)
  ];

  return {
    runtimeTileCore,
    aiTileLiteAt,
    buildTownSummaryForTile,
    thinTownSummaryForTile,
    townSummaryForTile,
    applyTileYieldSummary,
    playerTile,
    cardinalNeighborCores,
    adjacentNeighborCores
  };
};
