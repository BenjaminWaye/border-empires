import { WORLD_HEIGHT, WORLD_WIDTH, type Terrain, type Tile } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SEED_GRANARY_SLOTS } from "@border-empires/game-domain";
import { shouldYieldAt } from "./event-loop-yield.js";
import type { EconomyPlayer } from "./economy-network/economy-network.js";

export type RuntimeState = {
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

export type StrategicResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";
export type EconomyResourceKey = StrategicResourceKey | "GOLD";
export type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  resourceKey?: EconomyResourceKey;
  note?: string;
};
export type EconomyBreakdown = Record<EconomyResourceKey, { sources: EconomyBucket[]; sinks: EconomyBucket[] }>;
export type UpkeepPerMinute = { food: number; iron: number; supply: number; crystal: number; gold: number };
export type UpkeepLastTick = {
  foodCoverage: number;
  gold: { contributors: EconomyBucket[] };
  food: { contributors: EconomyBucket[] };
  iron: { contributors: EconomyBucket[] };
  crystal: { contributors: EconomyBucket[] };
  supply: { contributors: EconomyBucket[] };
};
export type LivePlayerEconomySnapshot = {
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
  fedTownKeys: Set<string>;
  fedTownKeysByPlayer: Map<string, Set<string>>;
};

export const keyFor = (x: number, y: number): string => `${x},${y}`;

export const snapshotEconomyPlayer = (player: RuntimeState["players"][number] | undefined): EconomyPlayer | undefined =>
  player
    ? {
        id: player.id,
        techIds: new Set(player.techIds),
        domainIds: new Set(player.domainIds),
        mods: { attack: 1, defense: 1, income: player.incomeMultiplier ?? 1, vision: player.vision }
      }
    : undefined;

export const parseTown = (tile: RuntimeState["tiles"][number]): Partial<NonNullable<Tile["town"]>> | undefined => {
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

export const parseStructure = <T>(json: string | undefined): T | undefined => {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

export const toDomainTile = (tile: RuntimeState["tiles"][number], town = parseTown(tile)): DomainTileState => ({
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

export const EMPTY_TOWN_KEY_SET: ReadonlySet<string> = new Set<string>();
export const nearbyWarTownKeysCache: WeakMap<RuntimeState, ReadonlySet<string>> = new WeakMap();
export const domainTilesByKeyCache: WeakMap<RuntimeState, Map<string, DomainTileState>> = new WeakMap();
export const settledDomainTilesByPlayerIdCache: WeakMap<RuntimeState, Map<string, DomainTileState[]>> = new WeakMap();
export const firstThreeTownKeysByPlayerCache: WeakMap<RuntimeState, Map<string, Set<string>>> = new WeakMap();
export const strategicProductionByPlayerCache: WeakMap<RuntimeState, Map<string, Record<StrategicResourceKey, number>>> = new WeakMap();
export const fedTownKeysByPlayerCache: WeakMap<RuntimeState, Map<string, Set<string>>> = new WeakMap();
export const waterworksKeysByPlayerCache: WeakMap<RuntimeState, Map<string, Set<string>>> = new WeakMap();
export const foundryKeysByPlayerCache: WeakMap<RuntimeState, Map<string, Set<string>>> = new WeakMap();

// Cached helper — toDomainTile calls JSON.parse(townJson) per town tile;
// rebuilding for all 202,500 tiles on every player bootstrap is the single
// most expensive synchronous operation in buildLivePlayerEconomySnapshot.
export const getDomainTilesByKey = (runtimeState: RuntimeState): Map<string, DomainTileState> => {
  const cached = domainTilesByKeyCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, DomainTileState>();
  for (const tile of runtimeState.tiles) result.set(keyFor(tile.x, tile.y), toDomainTile(tile));
  domainTilesByKeyCache.set(runtimeState, result);
  return result;
};

// Async variant — yields every 2,000 tiles on cold build, instant on cache hit.
export const getDomainTilesByKeyAsync = async (
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, DomainTileState>> => {
  const cached = domainTilesByKeyCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, DomainTileState>();
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    result.set(keyFor(tile.x, tile.y), toDomainTile(tile));
  }
  domainTilesByKeyCache.set(runtimeState, result);
  return result;
};

export const buildSettledDomainTilesByPlayerId = (
  runtimeState: RuntimeState,
  domainTilesByKey: ReadonlyMap<string, DomainTileState>
): Map<string, DomainTileState[]> => {
  const cached = settledDomainTilesByPlayerIdCache.get(runtimeState);
  if (cached) return cached;
  const byPlayerId = new Map<string, DomainTileState[]>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const domainTile = domainTilesByKey.get(keyFor(tile.x, tile.y));
    if (!domainTile) continue;
    const current = byPlayerId.get(tile.ownerId) ?? [];
    current.push(domainTile);
    byPlayerId.set(tile.ownerId, current);
  }
  settledDomainTilesByPlayerIdCache.set(runtimeState, byPlayerId);
  return byPlayerId;
};

export const buildSettledDomainTilesByPlayerIdAsync = async (
  runtimeState: RuntimeState,
  domainTilesByKey: ReadonlyMap<string, DomainTileState>,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, DomainTileState[]>> => {
  const cached = settledDomainTilesByPlayerIdCache.get(runtimeState);
  if (cached) return cached;
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
  settledDomainTilesByPlayerIdCache.set(runtimeState, byPlayerId);
  return byPlayerId;
};

export const buildFirstThreeTownKeysByPlayer = (
  runtimeState: RuntimeState
): Map<string, Set<string>> => {
  const cached = firstThreeTownKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, Set<string>>();
  for (const player of runtimeState.players) result.set(player.id, new Set<string>());
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const firstThree = result.get(tile.ownerId);
    if (!firstThree || firstThree.size >= 3) continue;
    firstThree.add(keyFor(tile.x, tile.y));
  }
  firstThreeTownKeysByPlayerCache.set(runtimeState, result);
  return result;
};

// Active Waterworks tile keys per owning player — mirrors
// SimulationRuntime.tileYieldEconomyContextForPlayer's waterworksKeys so the
// snapshot/bootstrap path applies the same +50% radius boost as live ticks.
// Reads economicStructureJson directly off the raw wire tiles (domainTilesByKey
// strips economicStructure), cached per runtimeState like the sibling builders above.
export const buildWaterworksKeysByPlayer = (runtimeState: RuntimeState): Map<string, Set<string>> => {
  const cached = waterworksKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const byPlayerId = new Map<string, Set<string>>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.type !== "WATERWORKS" || structure.status !== "active") continue;
    const keys = byPlayerId.get(tile.ownerId) ?? new Set<string>();
    keys.add(keyFor(tile.x, tile.y));
    byPlayerId.set(tile.ownerId, keys);
  }
  waterworksKeysByPlayerCache.set(runtimeState, byPlayerId);
  return byPlayerId;
};

// Mirrors buildWaterworksKeysByPlayer for FOUNDRY — the radius source for the
// Mine iron/crystal boost. See docs/plans/2026-07-06-radius-yield-delivery.md.
export const buildFoundryKeysByPlayer = (runtimeState: RuntimeState): Map<string, Set<string>> => {
  const cached = foundryKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const byPlayerId = new Map<string, Set<string>>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.type !== "FOUNDRY" || structure.status !== "active") continue;
    const keys = byPlayerId.get(tile.ownerId) ?? new Set<string>();
    keys.add(keyFor(tile.x, tile.y));
    byPlayerId.set(tile.ownerId, keys);
  }
  foundryKeysByPlayerCache.set(runtimeState, byPlayerId);
  return byPlayerId;
};

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

export const townKeysWithNearbyWar = (runtimeState: RuntimeState): ReadonlySet<string> => {
  const cached = nearbyWarTownKeysCache.get(runtimeState);
  if (cached) return cached;
  const fresh = computeTownKeysWithNearbyWar(runtimeState);
  nearbyWarTownKeysCache.set(runtimeState, fresh);
  return fresh;
};

// Island map only changes when terrain changes (create_mountain / remove_mountain).
// Runtime stamps a fresh terrainEpoch every time terrain mutates and at each
// fresh runtime instance. We keep at most 2 recent epochs in-memory so a long-
// running process never accumulates stale maps. With WORLD_WIDTH * WORLD_HEIGHT
// up to ~256k tiles, recomputing per snapshot would be the dominant cost; this
// turns it into a one-time amortised O(world) + O(1) lookup thereafter.
const ISLAND_MAP_CACHE_LIMIT = 2;
const islandMapByEpoch = new Map<number, ReadonlyMap<string, number>>();

export const computeIslandMap = (runtimeState: RuntimeState): ReadonlyMap<string, number> => {
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

export const computeSeedGranaryBuffedTileKeys = (runtimeState: RuntimeState): Set<string> => {
  const cached = seedGranaryBuffedCache.get(runtimeState);
  if (cached) return cached;
  const buffed = new Set<string>();
  const islandMap = computeIslandMap(runtimeState);
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
