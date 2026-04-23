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
};

export type GatewayTileUpdate = {
  x: number;
  y: number;
  terrain?: "LAND" | "SEA" | "MOUNTAIN";
  resource?: string;
  dockId?: string;
  ownerId?: string;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN";
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
};

type GatewayTileSyncDeps = {
  state: Pick<ClientState, "tiles" | "incomingAttacksByTile" | "pendingCollectVisibleKeys" | "discoveredTiles">;
  keyFor: (x: number, y: number) => string;
  mergeIncomingTileDetail: (existing: Tile | undefined, incoming: Tile) => Tile;
  mergeServerTileWithOptimisticState: (tile: Tile) => Tile;
};

const townFoodUpkeepPerMinuteForTier = (tier: TownSummary["populationTier"] | undefined): number => {
  if (tier === "SETTLEMENT" || !tier) return 0;
  if (tier === "CITY") return 0.2;
  if (tier === "GREAT_CITY") return 0.4;
  if (tier === "METROPOLIS") return 0.8;
  return 0.1;
};

const supportSummaryForTown = (
  ownerId: string | undefined,
  x: number,
  y: number,
  tiles: ReadonlyMap<string, Tile>,
  keyFor: (x: number, y: number) => string
): { supportCurrent: number; supportMax: number } => {
  if (!ownerId) return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tiles.get(keyFor(x + dx, y + dy));
      if (!tile || tile.terrain !== "LAND" || tile.dockId) continue;
      supportMax += 1;
      if (tile.ownerId === ownerId && tile.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const derivedTownSupportStructures = (
  ownerId: string | undefined,
  x: number,
  y: number,
  tiles: ReadonlyMap<string, Tile>,
  keyFor: (x: number, y: number) => string
): { hasMarket: boolean; hasGranary: boolean; hasBank: boolean } => {
  if (!ownerId) return { hasMarket: false, hasGranary: false, hasBank: false };
  let hasMarket = false;
  let hasGranary = false;
  let hasBank = false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tiles.get(keyFor(x + dx, y + dy));
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      const structure = tile.economicStructure;
      if (!structure || structure.status !== "active") continue;
      if (structure.type === "MARKET") hasMarket = true;
      if (structure.type === "GRANARY") hasGranary = true;
      if (structure.type === "BANK") hasBank = true;
    }
  }
  return { hasMarket, hasGranary, hasBank };
};

const derivedTownIsFed = (
  ownerId: string | undefined,
  x: number,
  y: number,
  tiles: ReadonlyMap<string, Tile>,
  keyFor: (x: number, y: number) => string
): boolean => {
  if (!ownerId) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tiles.get(keyFor(x + dx, y + dy));
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      if (tile.resource === "FARM" || tile.resource === "FISH") return true;
    }
  }
  return false;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isZeroTownStub = (town: PartialTownSummary, populationTier: TownSummary["populationTier"]): boolean => {
  if (populationTier === "SETTLEMENT") return false;
  const baseGoldPerMinute = isFiniteNumber(town.baseGoldPerMinute) ? town.baseGoldPerMinute : 0;
  const goldPerMinute = isFiniteNumber(town.goldPerMinute) ? town.goldPerMinute : 0;
  const cap = isFiniteNumber(town.cap) ? town.cap : 0;
  const supportCurrent = isFiniteNumber(town.supportCurrent) ? town.supportCurrent : 0;
  const supportMax = isFiniteNumber(town.supportMax) ? town.supportMax : 0;
  return (
    baseGoldPerMinute <= 0 &&
    goldPerMinute <= 0 &&
    cap <= 0 &&
    supportCurrent <= 0 &&
    supportMax <= 0 &&
    town.isFed === false
  );
};

const isPartialTownSummary = (town: PartialTownSummary, populationTier: TownSummary["populationTier"]): boolean =>
  !isFiniteNumber(town.supportCurrent) ||
  !isFiniteNumber(town.supportMax) ||
  !isFiniteNumber(town.baseGoldPerMinute) ||
  !isFiniteNumber(town.cap) ||
  isZeroTownStub(town, populationTier);

const enrichedGatewayTownSummary = (
  update: GatewayTileUpdate,
  partial: PartialTownSummary,
  existing: Tile | undefined,
  tiles: ReadonlyMap<string, Tile>,
  keyFor: (x: number, y: number) => string
): Tile["town"] | undefined => {
  const populationTier = partial.populationTier ?? update.townPopulationTier ?? "SETTLEMENT";
  const ownerId = update.ownerId ?? existing?.ownerId;
  const support = supportSummaryForTown(ownerId, update.x, update.y, tiles, keyFor);
  const activeSupport = derivedTownSupportStructures(ownerId, update.x, update.y, tiles, keyFor);
  const derivedIsFed = populationTier === "SETTLEMENT" ? true : derivedTownIsFed(ownerId, update.x, update.y, tiles, keyFor);
  const useDerivedTownState = isPartialTownSummary(partial, populationTier);
  const supportCurrent = useDerivedTownState
    ? support.supportCurrent
    : isFiniteNumber(partial.supportCurrent)
      ? partial.supportCurrent
      : support.supportCurrent;
  const supportMax = useDerivedTownState
    ? support.supportMax
    : isFiniteNumber(partial.supportMax)
      ? partial.supportMax
      : support.supportMax;
  const hasMarket = useDerivedTownState ? activeSupport.hasMarket : typeof partial.hasMarket === "boolean" ? partial.hasMarket : activeSupport.hasMarket;
  const hasGranary = useDerivedTownState ? activeSupport.hasGranary : typeof partial.hasGranary === "boolean" ? partial.hasGranary : activeSupport.hasGranary;
  const hasBank = useDerivedTownState ? activeSupport.hasBank : typeof partial.hasBank === "boolean" ? partial.hasBank : activeSupport.hasBank;
  const isFed = useDerivedTownState ? derivedIsFed : (typeof partial.isFed === "boolean" ? partial.isFed : derivedIsFed);
  const baseGoldPerMinute =
    !useDerivedTownState && isFiniteNumber(partial.baseGoldPerMinute)
      ? partial.baseGoldPerMinute
      : populationTier === "SETTLEMENT"
        ? 1
        : 2;
  const supportRatio = supportMax <= 0 ? 1 : supportCurrent / supportMax;
  const goldPerMinute =
    !useDerivedTownState && isFiniteNumber(partial.goldPerMinute)
      ? partial.goldPerMinute
      : populationTier === "SETTLEMENT"
        ? baseGoldPerMinute
        : isFed
          ? baseGoldPerMinute * supportRatio * (hasMarket ? 1.5 : 1) * (hasBank ? 1.5 : 1)
          : 0;
  const cap =
    !useDerivedTownState && isFiniteNumber(partial.cap)
      ? partial.cap
      : Math.max(0, goldPerMinute) * 60 * 8 * (hasMarket ? 1.5 : 1);
  return {
    ...(partial.name ? { name: partial.name } : update.townName ? { name: update.townName } : {}),
    type: partial.type ?? update.townType ?? "FARMING",
    baseGoldPerMinute,
    supportCurrent,
    supportMax,
    goldPerMinute,
    cap,
    isFed,
    population: isFiniteNumber(partial.population) ? partial.population : 1,
    maxPopulation: isFiniteNumber(partial.maxPopulation) ? partial.maxPopulation : 3,
    ...(typeof partial.populationGrowthPerMinute === "number" ? { populationGrowthPerMinute: partial.populationGrowthPerMinute } : {}),
    populationTier,
    connectedTownCount: isFiniteNumber(partial.connectedTownCount) ? partial.connectedTownCount : 0,
    connectedTownBonus: isFiniteNumber(partial.connectedTownBonus) ? partial.connectedTownBonus : 0,
    ...(Array.isArray(partial.connectedTownNames) ? { connectedTownNames: partial.connectedTownNames } : {}),
    ...(partial.goldIncomePausedReason ? { goldIncomePausedReason: partial.goldIncomePausedReason } : {}),
    ...(typeof partial.manpowerCurrent === "number" ? { manpowerCurrent: partial.manpowerCurrent } : {}),
    ...(typeof partial.manpowerCap === "number" ? { manpowerCap: partial.manpowerCap } : {}),
    hasMarket,
    marketActive: useDerivedTownState ? hasMarket && isFed : typeof partial.marketActive === "boolean" ? partial.marketActive : (hasMarket && isFed),
    hasGranary,
    granaryActive: useDerivedTownState ? hasGranary : typeof partial.granaryActive === "boolean" ? partial.granaryActive : hasGranary,
    hasBank,
    bankActive: useDerivedTownState ? hasBank : typeof partial.bankActive === "boolean" ? partial.bankActive : hasBank,
    foodUpkeepPerMinute:
      typeof partial.foodUpkeepPerMinute === "number" ? partial.foodUpkeepPerMinute : townFoodUpkeepPerMinuteForTier(populationTier),
    ...(Array.isArray(partial.growthModifiers) ? { growthModifiers: partial.growthModifiers } : {})
  };
};

const gatewayTownSummary = (
  update: GatewayTileUpdate,
  existing: Tile | undefined,
  tiles: ReadonlyMap<string, Tile>,
  keyFor: (x: number, y: number) => string
): Tile["town"] | undefined => {
  if (update.townJson) {
    try {
      return enrichedGatewayTownSummary(update, JSON.parse(update.townJson) as PartialTownSummary, existing, tiles, keyFor);
    } catch {
      // fall through to the lossy summary builder when malformed
    }
  }
  if (!update.townType) return undefined;
  return enrichedGatewayTownSummary(update, {
    ...(update.townName ? { name: update.townName } : {}),
    type: update.townType,
    population: 1,
    populationTier: update.townPopulationTier ?? "SETTLEMENT",
    maxPopulation: 3
  }, existing, tiles, keyFor);
};

const parseGatewayStructureJson = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

export const normalizeGatewayTileUpdate = (
  update: GatewayTileUpdate,
  args: {
    existing: Tile | undefined;
    tiles: ReadonlyMap<string, Tile>;
    keyFor: (x: number, y: number) => string;
  }
) : NormalizedGatewayTileUpdate => {
  const normalized: NormalizedGatewayTileUpdate = {};
  if (update.terrain) normalized.terrain = update.terrain;
  if ("resource" in update) normalized.resource = update.resource;
  if ("dockId" in update) normalized.dockId = update.dockId;
  if ("townJson" in update || "townType" in update || "townName" in update || "townPopulationTier" in update) {
    normalized.town = gatewayTownSummary(update, args.existing, args.tiles, args.keyFor);
  }
  if ("fortJson" in update) normalized.fort = parseGatewayStructureJson<Tile["fort"]>(update.fortJson);
  if ("observatoryJson" in update) normalized.observatory = parseGatewayStructureJson<Tile["observatory"]>(update.observatoryJson);
  if ("siegeOutpostJson" in update) normalized.siegeOutpost = parseGatewayStructureJson<Tile["siegeOutpost"]>(update.siegeOutpostJson);
  if ("economicStructureJson" in update) {
    normalized.economicStructure = parseGatewayStructureJson<Tile["economicStructure"]>(update.economicStructureJson);
  }
  if ("sabotageJson" in update) normalized.sabotage = parseGatewayStructureJson<Tile["sabotage"]>(update.sabotageJson);
  if ("shardSiteJson" in update) normalized.shardSite = parseGatewayStructureJson<NonNullable<Tile["shardSite"]>>(update.shardSiteJson);
  if ("ownerId" in update) normalized.ownerId = update.ownerId;
  if ("ownershipState" in update) normalized.ownershipState = update.ownershipState;
  if ("yield" in update) normalized.yield = update.yield;
  if ("yieldRate" in update) normalized.yieldRate = update.yieldRate;
  if ("yieldCap" in update) normalized.yieldCap = update.yieldCap;
  return normalized;
};

const applyGatewayTileUpdate = (deps: GatewayTileSyncDeps, update: GatewayTileUpdate): void => {
  const tileKey = deps.keyFor(update.x, update.y);
  deps.state.incomingAttacksByTile.delete(tileKey);
  deps.state.pendingCollectVisibleKeys.delete(tileKey);
  deps.state.discoveredTiles.add(tileKey);

  const existing = deps.state.tiles.get(tileKey);
  const merged: Tile = existing
    ? { ...existing, x: update.x, y: update.y }
    : {
        x: update.x,
        y: update.y,
        terrain: update.terrain ?? "LAND",
        detailLevel: "summary",
        fogged: false
      };
  // Gateway tile updates are the current visible set for this player.
  merged.fogged = false;

  const normalizedGateway = normalizeGatewayTileUpdate(update, {
    existing,
    tiles: deps.state.tiles,
    keyFor: deps.keyFor
  });

  if (normalizedGateway.terrain) merged.terrain = normalizedGateway.terrain;
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
  if ("shardSite" in normalizedGateway) {
    if (normalizedGateway.shardSite) merged.shardSite = normalizedGateway.shardSite;
    else delete merged.shardSite;
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
  if (!normalizedGateway.ownerId) delete merged.ownershipState;

  const resolved = deps.mergeServerTileWithOptimisticState(deps.mergeIncomingTileDetail(existing, merged));
  deps.state.tiles.set(tileKey, resolved);
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
  for (const tile of tiles) applyGatewayTileUpdate(deps, tile);
  return tiles.length;
};

export const applyGatewayTileDeltaBatch = (
  deps: GatewayTileSyncDeps,
  updates?: GatewayTileUpdate[]
): void => {
  if (!Array.isArray(updates) || updates.length === 0) return;
  for (const update of updates) applyGatewayTileUpdate(deps, update);
};
