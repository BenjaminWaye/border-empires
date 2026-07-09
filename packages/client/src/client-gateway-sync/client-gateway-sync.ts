import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { ensureTileYield } from "../yield-derivation/yield-derivation.js";

type TownSummary = NonNullable<Tile["town"]>;
type PartialTownSummary = Partial<TownSummary>;
type NormalizedGatewayTileUpdate = {
  detailLevel?: Tile["detailLevel"];
  terrain?: Tile["terrain"];
  resource?: Tile["resource"] | undefined;
  dockId?: string | undefined;
  town?: Tile["town"] | undefined;
  townType?: Tile["townType"] | undefined;
  townName?: Tile["townName"] | undefined;
  townPopulationTier?: Tile["townPopulationTier"] | undefined;
  townDataPartial?: boolean;
  fort?: Tile["fort"] | undefined;
  observatory?: Tile["observatory"] | undefined;
  siegeOutpost?: Tile["siegeOutpost"] | undefined;
  economicStructure?: Tile["economicStructure"] | undefined;
  sabotage?: Tile["sabotage"] | undefined;
  shardSite?: Tile["shardSite"] | undefined;
  muster?: Tile["muster"] | undefined;
  ownerId?: Tile["ownerId"] | undefined;
  ownershipState?: Tile["ownershipState"] | undefined;
  frontierDecayAt?: Tile["frontierDecayAt"] | undefined;
  frontierDecayKind?: Tile["frontierDecayKind"] | undefined;
  yield?: Tile["yield"] | undefined;
  yieldRate?: Tile["yieldRate"] | undefined;
  yieldCap?: Tile["yieldCap"] | undefined;
  upkeepEntries?: Tile["upkeepEntries"] | undefined;
  history?: Tile["history"] | undefined;
  landBiome?: Tile["landBiome"] | undefined;
  regionType?: Tile["regionType"] | undefined;
};

export type GatewayTileUpdate = {
  x: number;
  y: number;
  terrain?: Tile["terrain"];
  detailLevel?: Tile["detailLevel"];
  resource?: string;
  dockId?: string;
  ownerId?: string | null;
  ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" | null;
  frontierDecayAt?: number | null;
  frontierDecayKind?: Tile["frontierDecayKind"] | null;
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
  musterJson?: string;
  yield?: Tile["yield"];
  yieldRate?: Tile["yieldRate"];
  yieldCap?: Tile["yieldCap"];
  upkeepEntries?: Tile["upkeepEntries"];
  history?: Tile["history"];
  landBiome?: Tile["landBiome"];
  regionType?: Tile["regionType"]; visibilityState?: "VISIBLE" | "FOG" | "UNEXPLORED";
};

type GatewayTileSyncDeps = {
  state: Pick<ClientState, "tiles" | "tilesRevision" | "incomingAttacksByTile" | "pendingCollectVisibleKeys" | "discoveredTiles"> & {
    me?: string | undefined;
    mods?: Partial<ClientState["mods"]>;
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
  const upgrade = value as { targetTier?: unknown; requiredPopulation?: unknown; foodCost?: unknown; available?: unknown };
  return (
    (upgrade.targetTier === "CITY" || upgrade.targetTier === "GREAT_CITY" || upgrade.targetTier === "METROPOLIS") &&
    isFiniteNumber(upgrade.requiredPopulation) &&
    isFiniteNumber(upgrade.foodCost) &&
    typeof upgrade.available === "boolean"
  );
};

// Minimum population that any real town has. Below this, the summary is partial
// (no real population sent yet, or a zero-default) — the renderer should show
// a "loading" state instead of acting on bogus numbers.
export const MIN_RENDERABLE_TOWN_POPULATION = 500;

const isValidTownType = (value: unknown): value is NonNullable<TownSummary["type"]> =>
  value === "MARKET" || value === "FARMING";

const isValidTownPopulationTier = (value: unknown): value is NonNullable<TownSummary["populationTier"]> =>
  value === "SETTLEMENT" ||
  value === "TOWN" ||
  value === "CITY" ||
  value === "GREAT_CITY" ||
  value === "METROPOLIS";

const isFiniteOptionalNumber = (value: unknown): boolean => value === undefined || isFiniteNumber(value);

const isOptionalBoolean = (value: unknown): boolean => value === undefined || typeof value === "boolean";

// Renderable threshold: the gate the UI uses to decide if it has enough data to
// draw a town card. Foreign towns under satellite reveal carry only public
// fields (type/tier/population/maxPopulation/connected*), and the server
// intentionally strips owner-only economy fields. Population >= 500 is the
// authoritative "this is a real town" signal — anything lower is partial data
// and should drive a spinner state in the overview pane.
const isRenderableTownSummary = (town: PartialTownSummary | undefined): town is TownSummary =>
  Boolean(
    town &&
      isValidTownType(town.type) &&
      isValidTownPopulationTier(town.populationTier) &&
      isFiniteNumber(town.population) &&
      town.population >= MIN_RENDERABLE_TOWN_POPULATION &&
      isFiniteNumber(town.maxPopulation) &&
      // Tolerate missing private/economy fields — foreign towns under reveal
      // legitimately omit them. Just sanity-check the ones we DO receive.
      isFiniteOptionalNumber(town.baseGoldPerMinute) &&
      isFiniteOptionalNumber(town.supportCurrent) &&
      isFiniteOptionalNumber(town.supportMax) &&
      isFiniteOptionalNumber(town.goldPerMinute) &&
      isFiniteOptionalNumber(town.cap) &&
      isOptionalBoolean(town.isFed) &&
      isFiniteOptionalNumber(town.populationGrowthPerMinute) &&
      isFiniteOptionalNumber(town.connectedTownCount) &&
      isFiniteOptionalNumber(town.connectedTownBonus) &&
      (town.connectedTownNames === undefined || hasStringArray(town.connectedTownNames)) &&
      (town.goldIncomePausedReason === undefined || town.goldIncomePausedReason === "MANPOWER_NOT_FULL") &&
      isFiniteOptionalNumber(town.manpowerCurrent) &&
      isFiniteOptionalNumber(town.manpowerCap) &&
      isOptionalBoolean(town.hasMarket) &&
      isOptionalBoolean(town.marketActive) &&
      isOptionalBoolean(town.hasGranary) &&
      isOptionalBoolean(town.granaryActive) &&
      isOptionalBoolean(town.hasSeedGranary) &&
      isOptionalBoolean(town.seedGranaryActive) &&
      isOptionalBoolean(town.seedGranaryBuffed) &&
      isOptionalBoolean(town.hasBank) && isOptionalBoolean(town.bankActive) &&
      isOptionalBoolean(town.hasClearingHouse) && isOptionalBoolean(town.clearingHouseActive) && (town.clearingHouseTownNames === undefined || hasStringArray(town.clearingHouseTownNames)) &&
      isFiniteOptionalNumber(town.foodUpkeepPerMinute) &&
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

const gatewayTownIdentity = (
  update: GatewayTileUpdate,
  existing: Tile | undefined,
  town: Tile["town"] | undefined
): Pick<NormalizedGatewayTileUpdate, "townType" | "townName" | "townPopulationTier"> | undefined => {
  const existingType = existing?.town?.type ?? existing?.townType;
  const existingName = existing?.town?.name ?? existing?.townName;
  const existingTier = existing?.town?.populationTier ?? existing?.townPopulationTier;

  if ("townJson" in update && !update.townJson && !("townType" in update) && !("townName" in update) && !("townPopulationTier" in update)) {
    return { townType: undefined, townName: undefined, townPopulationTier: undefined };
  }

  const type = town?.type ?? update.townType ?? existingType;
  const name = town?.name ?? ("townName" in update ? update.townName : existingName);
  const populationTier = town?.populationTier ?? ("townPopulationTier" in update ? update.townPopulationTier : existingTier);

  if (!type && !name && !populationTier) return undefined;
  return {
    townType: type,
    townName: name,
    townPopulationTier: populationTier
  };
};

type GatewayTownSummaryResult = {
  town: Tile["town"] | undefined;
  // True when a parsed town payload failed the renderable gate. Drives the
  // overview pane's spinner state — distinct from "townType is set" because
  // tile-shell updates can carry townType without a town summary.
  partial: boolean;
};

const gatewayTownSummary = (
  update: GatewayTileUpdate,
  existing: Tile | undefined
): GatewayTownSummaryResult => {
  const existingTown = existing?.town;
  const parsedTown = parseGatewayStructureJson<PartialTownSummary>(update.townJson);
  if ("townJson" in update && !update.townJson) return { town: undefined, partial: false };
  if (parsedTown) {
    const authoritativeTown: PartialTownSummary = {
      ...parsedTown,
      ...(update.townName ? { name: update.townName } : {}),
      ...(update.townType ? { type: update.townType } : {}),
      ...(update.townPopulationTier ? { populationTier: update.townPopulationTier } : {})
    };
    if (isRenderableTownSummary(authoritativeTown)) return { town: authoritativeTown, partial: false };
    return { town: existingTown, partial: !existingTown };
  }
  if (!existingTown) return { town: undefined, partial: false };
  const mergedTown: PartialTownSummary = {
    ...existingTown,
    ...(update.townName ? { name: update.townName } : {}),
    ...(update.townType ? { type: update.townType } : {})
  };
  if (isRenderableTownSummary(mergedTown)) return { town: mergedTown, partial: false };
  return { town: existingTown, partial: false };
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
  if (update.detailLevel) normalized.detailLevel = update.detailLevel;
  if (update.terrain) normalized.terrain = update.terrain;
  if ("resource" in update) normalized.resource = update.resource;
  if ("dockId" in update) normalized.dockId = update.dockId;
  if ("townJson" in update || "townType" in update || "townName" in update || "townPopulationTier" in update) {
    const summary = gatewayTownSummary(update, args.existing);
    normalized.town = summary.town;
    normalized.townDataPartial = summary.partial;
    const townIdentity = gatewayTownIdentity(update, args.existing, normalized.town);
    if (townIdentity) Object.assign(normalized, townIdentity);
  }
  if ("fortJson" in update) normalized.fort = parseGatewayStructureJson<Tile["fort"]>(update.fortJson);
  if ("observatoryJson" in update) normalized.observatory = parseGatewayStructureJson<Tile["observatory"]>(update.observatoryJson);
  if ("siegeOutpostJson" in update) normalized.siegeOutpost = parseGatewayStructureJson<Tile["siegeOutpost"]>(update.siegeOutpostJson);
  if ("economicStructureJson" in update) {
    normalized.economicStructure = parseGatewayStructureJson<Tile["economicStructure"]>(update.economicStructureJson);
  }
  if ("sabotageJson" in update) normalized.sabotage = parseGatewayStructureJson<Tile["sabotage"]>(update.sabotageJson);
  if ("shardSiteJson" in update) normalized.shardSite = parseGatewayStructureJson<NonNullable<Tile["shardSite"]>>(update.shardSiteJson);
  if ("musterJson" in update) normalized.muster = parseGatewayStructureJson<Tile["muster"]>(update.musterJson);
  if ("ownerId" in update) normalized.ownerId = typeof update.ownerId === "string" ? update.ownerId : undefined;
  if ("ownershipState" in update) {
    normalized.ownershipState =
      update.ownershipState === "FRONTIER" || update.ownershipState === "SETTLED" || update.ownershipState === "BARBARIAN"
        ? update.ownershipState
        : undefined;
  }
  if ("frontierDecayAt" in update) {
    normalized.frontierDecayAt = typeof update.frontierDecayAt === "number" && update.frontierDecayAt > 0
      ? update.frontierDecayAt
      : undefined;
  }
  if ("frontierDecayKind" in update) {
    normalized.frontierDecayKind =
      update.frontierDecayKind === "NATURAL" || update.frontierDecayKind === "ENCIRCLEMENT" ? update.frontierDecayKind : undefined;
  }
  if ("yield" in update) normalized.yield = update.yield;
  if ("yieldRate" in update) normalized.yieldRate = update.yieldRate;
  if ("yieldCap" in update) normalized.yieldCap = update.yieldCap;
  if ("upkeepEntries" in update) normalized.upkeepEntries = update.upkeepEntries;
  if ("history" in update) normalized.history = update.history;
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

const applyGatewayTileUpdate = (deps: GatewayTileSyncDeps, update: GatewayTileUpdate, skipRevision = false): boolean => {
  const tileKey = deps.keyFor(update.x, update.y);
  deps.state.incomingAttacksByTile.delete(tileKey);
  deps.state.pendingCollectVisibleKeys.delete(tileKey);
  deps.state.discoveredTiles.add(tileKey); // FOG is still "discovered" (frozen last-witnessed state); server never emits UNEXPLORED as an update

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
  merged.fogged = update.visibilityState === "FOG"; // freezes at this delta's post-mutation fields (e.g. a witnessed ownership flip); VISIBLE/omitted clears fogged

  const normalizedGateway = normalizeGatewayTileUpdate(update, {
    existing,
    tiles: deps.state.tiles,
    keyFor: deps.keyFor,
    foodCoverage: deps.state.upkeepLastTick.foodCoverage
  });

  if (normalizedGateway.terrain) merged.terrain = normalizedGateway.terrain;
  if (normalizedGateway.detailLevel) merged.detailLevel = normalizedGateway.detailLevel;
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
  if ("townType" in normalizedGateway) {
    if (normalizedGateway.townType) merged.townType = normalizedGateway.townType;
    else delete merged.townType;
  }
  if ("townName" in normalizedGateway) {
    if (normalizedGateway.townName) merged.townName = normalizedGateway.townName;
    else delete merged.townName;
  }
  if ("townPopulationTier" in normalizedGateway) {
    if (normalizedGateway.townPopulationTier) merged.townPopulationTier = normalizedGateway.townPopulationTier;
    else delete merged.townPopulationTier;
  }
  if (merged.town) {
    merged.townType = merged.town.type;
    if (merged.town.name) merged.townName = merged.town.name;
    merged.townPopulationTier = merged.town.populationTier;
  }
  if ("townDataPartial" in normalizedGateway) {
    if (normalizedGateway.townDataPartial) merged.townDataPartial = true;
    else delete merged.townDataPartial;
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
  if ("muster" in normalizedGateway) {
    if (normalizedGateway.muster) merged.muster = normalizedGateway.muster;
    else delete merged.muster;
  }

  if ("ownerId" in normalizedGateway) {
    if (normalizedGateway.ownerId) merged.ownerId = normalizedGateway.ownerId;
    else delete merged.ownerId;
  }
  if ("ownershipState" in normalizedGateway) {
    if (normalizedGateway.ownershipState) merged.ownershipState = normalizedGateway.ownershipState;
    else delete merged.ownershipState;
  }
  if ("frontierDecayAt" in normalizedGateway) {
    if (typeof normalizedGateway.frontierDecayAt === "number") merged.frontierDecayAt = normalizedGateway.frontierDecayAt;
    else delete merged.frontierDecayAt;
  }
  if ("frontierDecayKind" in normalizedGateway) {
    if (normalizedGateway.frontierDecayKind) merged.frontierDecayKind = normalizedGateway.frontierDecayKind;
    else delete merged.frontierDecayKind;
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
  if ("upkeepEntries" in normalizedGateway) {
    if (normalizedGateway.upkeepEntries) merged.upkeepEntries = normalizedGateway.upkeepEntries;
    else delete merged.upkeepEntries;
  }
  if ("history" in normalizedGateway) {
    if (normalizedGateway.history) merged.history = normalizedGateway.history;
    else delete merged.history;
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
  // Structure/resource/dock change without a fresh server rate clears the stale value (radius-yield-delivery plan Phase 4).
  const staleYieldInputsChanged =
    ("economicStructure" in normalizedGateway && JSON.stringify(normalizedGateway.economicStructure) !== JSON.stringify(existing?.economicStructure)) ||
    ("resource" in normalizedGateway && normalizedGateway.resource !== existing?.resource) ||
    ("dockId" in normalizedGateway && normalizedGateway.dockId !== existing?.dockId);
  if (staleYieldInputsChanged && !("yieldRate" in normalizedGateway)) delete resolved.yieldRate;
  if (staleYieldInputsChanged && !("yieldCap" in normalizedGateway)) delete resolved.yieldCap;
  const ownIncomeMultiplier =
    resolved.ownerId && deps.state.me && resolved.ownerId === deps.state.me
      ? deps.state.mods?.income ?? 1.0
      : 1.0;
  ensureTileYield(resolved as Parameters<typeof ensureTileYield>[0], ownIncomeMultiplier);
  deps.state.tiles.set(tileKey, resolved);
  if (!skipRevision) deps.state.tilesRevision += 1;
  refreshGatewayDerivedTownSummariesAroundTile(deps, update.x, update.y);
  return previousTerrain !== resolved.terrain || previousLandBiome !== resolved.landBiome || previousRegionType !== resolved.regionType;
};

export const applyGatewayInitialState = (
  deps: GatewayTileSyncDeps,
  initialState?: { tiles?: GatewayTileUpdate[] },
  options?: { preserveExistingDiscoveredTiles?: boolean }
): number => {
  const tiles = initialState?.tiles;
  // Missing tiles field is a no-op (caller passed nothing). An EMPTY tiles
  // array is a valid replacement intent — TILE_SNAPSHOT_REPLACE after a
  // full-map reveal can hand back a fog-on snapshot whose visible-tile slice
  // is small or even empty, and we still have to drop the previously-revealed
  // tiles from state.tiles or the map keeps rendering the reveal.
  if (!Array.isArray(tiles)) return 0;
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
  deps.state.tilesRevision += 1; // single bump for the whole batch
  let invalidatedTerrainCache = false;
  for (const tile of tiles) {
    invalidatedTerrainCache = applyGatewayTileUpdate(deps, tile, true) || invalidatedTerrainCache;
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
