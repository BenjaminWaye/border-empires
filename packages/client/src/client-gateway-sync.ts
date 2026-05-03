import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

type TownSummary = NonNullable<Tile["town"]>;
type PartialTownSummary = Partial<TownSummary>;
type NormalizedGatewayTileUpdate = {
  terrain?: Tile["terrain"];
  resource?: Tile["resource"] | undefined;
  dockId?: string | undefined;
  town?: Tile["town"] | undefined;
  fort?: Tile["fort"] | undefined;
  observatory?: Tile["observatory"] | undefined;
  siegeOutpost?: Tile["siegeOutpost"] | undefined;
  economicStructure?: Tile["economicStructure"] | undefined;
  sabotage?: Tile["sabotage"] | undefined;
  shardSite?: Tile["shardSite"] | undefined;
  ownerId?: Tile["ownerId"] | undefined;
  ownershipState?: Tile["ownershipState"] | undefined;
  yield?: Tile["yield"] | undefined;
  yieldRate?: Tile["yieldRate"] | undefined;
  yieldCap?: Tile["yieldCap"] | undefined;
  landBiome?: Tile["landBiome"] | undefined;
  regionType?: Tile["regionType"] | undefined;
};

export type GatewayTileUpdate = {
  x: number;
  y: number;
  terrain?: Tile["terrain"];
  resource?: string;
  dockId?: string;
  ownerId?: string | null;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | null;
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
  yield?: Tile["yield"];
  yieldRate?: Tile["yieldRate"];
  yieldCap?: Tile["yieldCap"];
  landBiome?: Tile["landBiome"];
  regionType?: Tile["regionType"];
};

type GatewayTileSyncDeps = {
  state: Pick<ClientState, "tiles" | "incomingAttacksByTile" | "pendingCollectVisibleKeys" | "discoveredTiles"> & {
    me?: string | undefined;
    upkeepLastTick: { foodCoverage?: number };
  };
  keyFor: (x: number, y: number) => string;
  mergeIncomingTileDetail: (existing: Tile | undefined, incoming: Tile) => Tile;
  mergeServerTileWithOptimisticState: (tile: Tile) => Tile;
  clearRenderCaches?: () => void;
  buildMiniMapBase?: () => void;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const hasStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isGrowthModifierArray = (value: unknown): value is NonNullable<TownSummary["growthModifiers"]> =>
  Array.isArray(value) &&
  value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const modifier = entry as { label?: unknown; deltaPerMinute?: unknown };
    return (
      (modifier.label === "Recently captured" || modifier.label === "Nearby war" || modifier.label === "Long time peace") &&
      isFiniteNumber(modifier.deltaPerMinute)
    );
  });

const isNextPopulationTierUpgrade = (value: unknown): value is NonNullable<TownSummary["nextPopulationTierUpgrade"]> => {
  if (!value || typeof value !== "object") return false;
  const upgrade = value as { targetTier?: unknown; requiredPopulation?: unknown; goldCost?: unknown; available?: unknown };
  return (
    (upgrade.targetTier === "CITY" || upgrade.targetTier === "GREAT_CITY" || upgrade.targetTier === "METROPOLIS") &&
    isFiniteNumber(upgrade.requiredPopulation) &&
    isFiniteNumber(upgrade.goldCost) &&
    typeof upgrade.available === "boolean"
  );
};

const isCompleteTownSummary = (town: PartialTownSummary | undefined): town is TownSummary =>
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
      (town.populationGrowthPerMinute === undefined || isFiniteNumber(town.populationGrowthPerMinute)) &&
      isFiniteNumber(town.connectedTownCount) &&
      isFiniteNumber(town.connectedTownBonus) &&
      (town.connectedTownNames === undefined || hasStringArray(town.connectedTownNames)) &&
      (town.goldIncomePausedReason === undefined || town.goldIncomePausedReason === "MANPOWER_NOT_FULL") &&
      (town.manpowerCurrent === undefined || isFiniteNumber(town.manpowerCurrent)) &&
      (town.manpowerCap === undefined || isFiniteNumber(town.manpowerCap)) &&
      typeof town.hasMarket === "boolean" &&
      typeof town.marketActive === "boolean" &&
      typeof town.hasGranary === "boolean" &&
      typeof town.granaryActive === "boolean" &&
      typeof town.hasBank === "boolean" &&
      typeof town.bankActive === "boolean" &&
      (town.foodUpkeepPerMinute === undefined || isFiniteNumber(town.foodUpkeepPerMinute)) &&
      (town.growthModifiers === undefined || isGrowthModifierArray(town.growthModifiers)) &&
      (town.nextPopulationTierUpgrade === undefined || isNextPopulationTierUpgrade(town.nextPopulationTierUpgrade))
  );

const parseGatewayStructureJson = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const gatewayTownSummary = (
  update: GatewayTileUpdate,
  existing: Tile | undefined
): Tile["town"] | undefined => {
  const existingTown = existing?.town;
  const parsedTown = parseGatewayStructureJson<PartialTownSummary>(update.townJson);
  if ("townJson" in update && !update.townJson) return undefined;
  if (parsedTown) {
    const authoritativeTown: PartialTownSummary = {
      ...parsedTown,
      ...(update.townName ? { name: update.townName } : {}),
      ...(update.townType ? { type: update.townType } : {}),
      ...(update.townPopulationTier ? { populationTier: update.townPopulationTier } : {})
    };
    return isCompleteTownSummary(authoritativeTown) ? authoritativeTown : existingTown;
  }
  if (!existingTown) return undefined;
  const mergedTown: PartialTownSummary = {
    ...existingTown,
    ...(update.townName ? { name: update.townName } : {}),
    ...(update.townType ? { type: update.townType } : {})
  };
  return isCompleteTownSummary(mergedTown) ? mergedTown : existingTown;
};

export const normalizeGatewayTileUpdate = (
  update: GatewayTileUpdate,
  args: {
    existing: Tile | undefined;
    tiles: ReadonlyMap<string, Tile>;
    keyFor: (x: number, y: number) => string;
    foodCoverage: number | undefined;
  }
): NormalizedGatewayTileUpdate => {
  const normalized: NormalizedGatewayTileUpdate = {};
  if (update.terrain) normalized.terrain = update.terrain;
  if ("resource" in update) normalized.resource = update.resource;
  if ("dockId" in update) normalized.dockId = update.dockId;
  if ("townJson" in update || "townType" in update || "townName" in update || "townPopulationTier" in update) {
    normalized.town = gatewayTownSummary(update, args.existing);
  }
  if ("fortJson" in update) normalized.fort = parseGatewayStructureJson<Tile["fort"]>(update.fortJson);
  if ("observatoryJson" in update) normalized.observatory = parseGatewayStructureJson<Tile["observatory"]>(update.observatoryJson);
  if ("siegeOutpostJson" in update) normalized.siegeOutpost = parseGatewayStructureJson<Tile["siegeOutpost"]>(update.siegeOutpostJson);
  if ("economicStructureJson" in update) {
    normalized.economicStructure = parseGatewayStructureJson<Tile["economicStructure"]>(update.economicStructureJson);
  }
  if ("sabotageJson" in update) normalized.sabotage = parseGatewayStructureJson<Tile["sabotage"]>(update.sabotageJson);
  if ("shardSiteJson" in update) normalized.shardSite = parseGatewayStructureJson<NonNullable<Tile["shardSite"]>>(update.shardSiteJson);
  if ("ownerId" in update) normalized.ownerId = typeof update.ownerId === "string" ? update.ownerId : undefined;
  if ("ownershipState" in update) {
    normalized.ownershipState =
      update.ownershipState === "FRONTIER" || update.ownershipState === "SETTLED" || update.ownershipState === "BARBARIAN"
        ? update.ownershipState
        : undefined;
  }
  if ("yield" in update) normalized.yield = update.yield;
  if ("yieldRate" in update) normalized.yieldRate = update.yieldRate;
  if ("yieldCap" in update) normalized.yieldCap = update.yieldCap;
  if ("landBiome" in update) normalized.landBiome = update.landBiome;
  if ("regionType" in update) normalized.regionType = update.regionType;
  return normalized;
};

export const refreshAllGatewayDerivedTownSummaries = (
  _deps: Pick<GatewayTileSyncDeps, "state" | "keyFor">
): void => {};

export const refreshGatewayDerivedTownSummariesAroundTile = (
  _deps: Pick<GatewayTileSyncDeps, "state" | "keyFor">,
  _x: number,
  _y: number
): void => {};

const applyGatewayTileUpdate = (deps: GatewayTileSyncDeps, update: GatewayTileUpdate): boolean => {
  const tileKey = deps.keyFor(update.x, update.y);
  deps.state.incomingAttacksByTile.delete(tileKey);
  deps.state.pendingCollectVisibleKeys.delete(tileKey);
  deps.state.discoveredTiles.add(tileKey);

  const existing = deps.state.tiles.get(tileKey);
  const previousTerrain = existing?.terrain;
  const previousLandBiome = existing?.landBiome;
  const previousRegionType = existing?.regionType;
  const merged: Tile = existing
    ? { ...existing, x: update.x, y: update.y }
    : {
        x: update.x,
        y: update.y,
        terrain: update.terrain ?? "LAND",
        detailLevel: "summary",
        fogged: false
      };
  merged.fogged = false;

  const normalizedGateway = normalizeGatewayTileUpdate(update, {
    existing,
    tiles: deps.state.tiles,
    keyFor: deps.keyFor,
    foodCoverage: deps.state.upkeepLastTick.foodCoverage
  });

  if (normalizedGateway.terrain) merged.terrain = normalizedGateway.terrain;
  const terrainChanged = previousTerrain !== merged.terrain;
  if (merged.terrain !== "LAND") {
    delete merged.landBiome;
    delete merged.regionType;
  } else if (terrainChanged) {
    if (!("landBiome" in normalizedGateway)) delete merged.landBiome;
    if (!("regionType" in normalizedGateway)) delete merged.regionType;
  }
  if ("resource" in normalizedGateway) {
    if (normalizedGateway.resource) merged.resource = normalizedGateway.resource;
    else delete merged.resource;
  }
  if ("dockId" in normalizedGateway) {
    if (normalizedGateway.dockId) merged.dockId = normalizedGateway.dockId;
    else delete merged.dockId;
  }
  if ("town" in normalizedGateway) {
    if (normalizedGateway.town) merged.town = normalizedGateway.town;
    else delete merged.town;
  }
  if ("fort" in normalizedGateway) {
    if (normalizedGateway.fort) merged.fort = normalizedGateway.fort;
    else delete merged.fort;
  }
  if ("observatory" in normalizedGateway) {
    if (normalizedGateway.observatory) merged.observatory = normalizedGateway.observatory;
    else delete merged.observatory;
  }
  if ("siegeOutpost" in normalizedGateway) {
    if (normalizedGateway.siegeOutpost) merged.siegeOutpost = normalizedGateway.siegeOutpost;
    else delete merged.siegeOutpost;
  }
  if ("economicStructure" in normalizedGateway) {
    if (normalizedGateway.economicStructure) merged.economicStructure = normalizedGateway.economicStructure;
    else delete merged.economicStructure;
  }
  if ("sabotage" in normalizedGateway) {
    if (normalizedGateway.sabotage) merged.sabotage = normalizedGateway.sabotage;
    else delete merged.sabotage;
  }
  const claimedShardSite = !existing?.ownerId && existing?.shardSite ? existing.shardSite : undefined;
  if ("shardSite" in normalizedGateway) {
    if (normalizedGateway.shardSite) merged.shardSite = normalizedGateway.shardSite;
    else if (claimedShardSite && normalizedGateway.ownerId === deps.state.me && normalizedGateway.ownershipState === "FRONTIER") {
      merged.shardSite = claimedShardSite;
    } else delete merged.shardSite;
  }

  if ("ownerId" in normalizedGateway) {
    if (normalizedGateway.ownerId) merged.ownerId = normalizedGateway.ownerId;
    else delete merged.ownerId;
  }
  if ("ownershipState" in normalizedGateway) {
    if (normalizedGateway.ownershipState) merged.ownershipState = normalizedGateway.ownershipState;
    else delete merged.ownershipState;
  }
  if ("yield" in normalizedGateway) {
    if (normalizedGateway.yield) merged.yield = normalizedGateway.yield;
    else delete merged.yield;
  }
  if ("yieldRate" in normalizedGateway) {
    if (normalizedGateway.yieldRate) merged.yieldRate = normalizedGateway.yieldRate;
    else delete merged.yieldRate;
  }
  if ("yieldCap" in normalizedGateway) {
    if (normalizedGateway.yieldCap) merged.yieldCap = normalizedGateway.yieldCap;
    else delete merged.yieldCap;
  }
  if ("landBiome" in normalizedGateway) {
    if (normalizedGateway.landBiome) merged.landBiome = normalizedGateway.landBiome;
    else delete merged.landBiome;
  }
  if ("regionType" in normalizedGateway) {
    if (normalizedGateway.regionType) merged.regionType = normalizedGateway.regionType;
    else delete merged.regionType;
  }
  if ("ownerId" in normalizedGateway && !normalizedGateway.ownerId) delete merged.ownershipState;

  const resolved = deps.mergeServerTileWithOptimisticState(deps.mergeIncomingTileDetail(existing, merged));
  deps.state.tiles.set(tileKey, resolved);
  refreshGatewayDerivedTownSummariesAroundTile(deps, update.x, update.y);
  return previousTerrain !== resolved.terrain || previousLandBiome !== resolved.landBiome || previousRegionType !== resolved.regionType;
};

export const applyGatewayInitialState = (
  deps: GatewayTileSyncDeps,
  initialState?: { tiles?: GatewayTileUpdate[] },
  options?: { preserveExistingDiscoveredTiles?: boolean }
): number => {
  const tiles = initialState?.tiles;
  if (!Array.isArray(tiles) || tiles.length === 0) return 0;
  const preserveExistingDiscoveredTiles = options?.preserveExistingDiscoveredTiles === true;
  if (preserveExistingDiscoveredTiles) {
    for (const [tileKey, tile] of deps.state.tiles) {
      deps.state.tiles.set(tileKey, {
        ...tile,
        fogged: true
      });
    }
    deps.state.incomingAttacksByTile.clear();
    deps.state.pendingCollectVisibleKeys.clear();
  } else {
    deps.state.tiles.clear();
    deps.state.incomingAttacksByTile.clear();
    deps.state.pendingCollectVisibleKeys.clear();
    deps.state.discoveredTiles.clear();
  }
  let invalidatedTerrainCache = false;
  for (const tile of tiles) {
    invalidatedTerrainCache = applyGatewayTileUpdate(deps, tile) || invalidatedTerrainCache;
  }
  if (invalidatedTerrainCache) {
    deps.clearRenderCaches?.();
    deps.buildMiniMapBase?.();
  }
  return tiles.length;
};

export const applyGatewayTileDeltaBatch = (
  deps: GatewayTileSyncDeps,
  updates?: GatewayTileUpdate[]
): void => {
  if (!Array.isArray(updates) || updates.length === 0) return;
  let invalidatedTerrainCache = false;
  for (const update of updates) {
    invalidatedTerrainCache = applyGatewayTileUpdate(deps, update) || invalidatedTerrainCache;
  }
  if (invalidatedTerrainCache) {
    deps.clearRenderCaches?.();
    deps.buildMiniMapBase?.();
  }
};
