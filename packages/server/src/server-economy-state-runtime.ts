import type {
  Dock,
  EconomicStructure,
  EconomicStructureType,
  Fort,
  OwnershipState,
  Player,
  ResourceType,
  TileKey
} from "@border-empires/shared";

import type { PlayerEconomyIndex, StrategicResource, TileYieldBuffer, TownDefinition } from "./server-shared-types.js";

export interface CreateServerEconomyStateRuntimeDeps {
  resourceCountsByPlayer: Map<string, Record<ResourceType, number>>;
  strategicResourceStockByPlayer: Map<string, Record<StrategicResource, number>>;
  strategicResourceBufferByPlayer: Map<string, Record<StrategicResource, number>>;
  tileYieldByTile: Map<TileKey, TileYieldBuffer>;
  economyIndexByPlayer: Map<string, PlayerEconomyIndex>;
  observatoryTileKeysByPlayer: Map<string, Set<TileKey>>;
  economicStructureTileKeysByPlayer: Map<string, Set<TileKey>>;
  players: Map<string, Player>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  fortsByTile: Map<TileKey, Fort>;
  siegeOutpostsByTile: Map<TileKey, { ownerId: string }>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  docksByTile: Map<TileKey, Dock>;
  townsByTile: Map<TileKey, TownDefinition>;
  parseKey: (tileKey: TileKey) => [number, number];
  terrainAtRuntime: (x: number, y: number) => "LAND" | "SEA" | "MOUNTAIN";
  applyClusterResources: (x: number, y: number, resource: ResourceType | undefined) => ResourceType | undefined;
  resourceAt: (x: number, y: number) => ResourceType | undefined;
  strategicResourceKeys: readonly StrategicResource[];
}

export interface ServerEconomyStateRuntime {
  getOrInitResourceCounts: (playerId: string) => Record<ResourceType, number>;
  emptyStrategicStocks: () => Record<StrategicResource, number>;
  emptyTileYield: () => TileYieldBuffer;
  emptyPlayerEconomyIndex: () => PlayerEconomyIndex;
  getOrInitEconomyIndex: (playerId: string) => PlayerEconomyIndex;
  getOrInitOwnedTileKeySet: (index: Map<string, Set<TileKey>>, playerId: string) => Set<TileKey>;
  trackOwnedTileKey: (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey) => void;
  untrackOwnedTileKey: (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey) => void;
  ownedStructureCountForPlayer: (
    playerId: string,
    structureType: "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType
  ) => number;
  rebuildEconomyIndexForPlayer: (playerId: string) => void;
  hasPositiveStrategicBuffer: (strategic: Partial<Record<StrategicResource, number>>) => boolean;
  pruneEmptyTileYield: (tileKey: TileKey, yieldBuffer: TileYieldBuffer) => void;
  roundedPositiveStrategic: (
    strategic: Record<StrategicResource, number>
  ) => Partial<Record<StrategicResource, number>>;
  getOrInitStrategicStocks: (playerId: string) => Record<StrategicResource, number>;
  getOrInitStrategicBuffer: (playerId: string) => Record<StrategicResource, number>;
  getOrInitTileYield: (tileKey: TileKey) => TileYieldBuffer;
  availableYieldStrategicForPlayer: (player: Player, resource: StrategicResource) => number;
}

export const createServerEconomyStateRuntime = (
  deps: CreateServerEconomyStateRuntimeDeps
): ServerEconomyStateRuntime => {
  const getOrInitResourceCounts = (playerId: string): Record<ResourceType, number> => {
    let counts = deps.resourceCountsByPlayer.get(playerId);
    if (!counts) {
      counts = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
      deps.resourceCountsByPlayer.set(playerId, counts);
    } else {
      if (counts.FARM === undefined) counts.FARM = 0;
      if (counts.FISH === undefined) counts.FISH = 0;
      if (counts.FUR === undefined) counts.FUR = 0;
      if (counts.WOOD === undefined) counts.WOOD = 0;
      if (counts.IRON === undefined) counts.IRON = 0;
      if (counts.GEMS === undefined) counts.GEMS = 0;
      if (counts.OIL === undefined) counts.OIL = 0;
    }
    return counts;
  };

  const emptyStrategicStocks = (): Record<StrategicResource, number> => ({
    FOOD: 0,
    IRON: 0,
    CRYSTAL: 0,
    SUPPLY: 0,
    SHARD: 0,
    OIL: 0
  });

  const emptyTileYield = (): TileYieldBuffer => ({ gold: 0, strategic: emptyStrategicStocks() });

  const emptyPlayerEconomyIndex = (): PlayerEconomyIndex => ({
    settledResourceTileKeys: new Set<TileKey>(),
    settledDockTileKeys: new Set<TileKey>(),
    settledTownTileKeys: new Set<TileKey>()
  });

  const getOrInitEconomyIndex = (playerId: string): PlayerEconomyIndex => {
    let index = deps.economyIndexByPlayer.get(playerId);
    if (!index) {
      index = emptyPlayerEconomyIndex();
      deps.economyIndexByPlayer.set(playerId, index);
    }
    return index;
  };

  const getOrInitOwnedTileKeySet = (index: Map<string, Set<TileKey>>, playerId: string): Set<TileKey> => {
    let set = index.get(playerId);
    if (!set) {
      set = new Set<TileKey>();
      index.set(playerId, set);
    }
    return set;
  };

  const trackOwnedTileKey = (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey): void => {
    getOrInitOwnedTileKeySet(index, playerId).add(tileKey);
  };

  const untrackOwnedTileKey = (index: Map<string, Set<TileKey>>, playerId: string, tileKey: TileKey): void => {
    const set = index.get(playerId);
    if (!set) return;
    set.delete(tileKey);
    if (set.size === 0) index.delete(playerId);
  };

  const ownedStructureCountForPlayer = (
    playerId: string,
    structureType: "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType
  ): number => {
    if (structureType === "FORT") {
      let count = 0;
      for (const fort of deps.fortsByTile.values()) {
        if (fort.ownerId === playerId) count += 1;
      }
      return count;
    }
    if (structureType === "OBSERVATORY") return deps.observatoryTileKeysByPlayer.get(playerId)?.size ?? 0;
    if (structureType === "SIEGE_OUTPOST") {
      let count = 0;
      for (const outpost of deps.siegeOutpostsByTile.values()) {
        if (outpost.ownerId === playerId) count += 1;
      }
      return count;
    }
    let count = 0;
    for (const tileKey of deps.economicStructureTileKeysByPlayer.get(playerId) ?? []) {
      const structure = deps.economicStructuresByTile.get(tileKey);
      if (structure?.ownerId === playerId && structure.type === structureType) count += 1;
    }
    return count;
  };

  const rebuildEconomyIndexForPlayer = (playerId: string): void => {
    const player = deps.players.get(playerId);
    if (!player) {
      deps.economyIndexByPlayer.delete(playerId);
      return;
    }
    const index = getOrInitEconomyIndex(playerId);
    index.settledResourceTileKeys.clear();
    index.settledDockTileKeys.clear();
    index.settledTownTileKeys.clear();
    for (const tileKey of player.territoryTiles) {
      if (deps.ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
      const [x, y] = deps.parseKey(tileKey);
      if (deps.terrainAtRuntime(x, y) !== "LAND") continue;
      const resource = deps.applyClusterResources(x, y, deps.resourceAt(x, y));
      if (resource) index.settledResourceTileKeys.add(tileKey);
      if (deps.docksByTile.has(tileKey)) index.settledDockTileKeys.add(tileKey);
      if (deps.townsByTile.has(tileKey)) index.settledTownTileKeys.add(tileKey);
    }
  };

  const hasPositiveStrategicBuffer = (strategic: Partial<Record<StrategicResource, number>>): boolean => {
    for (const resource of deps.strategicResourceKeys) {
      if ((strategic[resource] ?? 0) > 0) return true;
    }
    return false;
  };

  const pruneEmptyTileYield = (tileKey: TileKey, yieldBuffer: TileYieldBuffer): void => {
    if (yieldBuffer.gold > 0 || hasPositiveStrategicBuffer(yieldBuffer.strategic)) return;
    deps.tileYieldByTile.delete(tileKey);
  };

  const roundedPositiveStrategic = (
    strategic: Record<StrategicResource, number>
  ): Partial<Record<StrategicResource, number>> => {
    const out: Partial<Record<StrategicResource, number>> = {};
    for (const resource of deps.strategicResourceKeys) {
      const value = strategic[resource] ?? 0;
      if (value > 0) out[resource] = Number(value.toFixed(3));
    }
    return out;
  };

  const getOrInitStrategicStocks = (playerId: string): Record<StrategicResource, number> => {
    let stock = deps.strategicResourceStockByPlayer.get(playerId);
    if (!stock) {
      stock = emptyStrategicStocks();
      deps.strategicResourceStockByPlayer.set(playerId, stock);
    }
    for (const resource of deps.strategicResourceKeys) {
      if (stock[resource] === undefined) stock[resource] = 0;
    }
    return stock;
  };

  const getOrInitStrategicBuffer = (playerId: string): Record<StrategicResource, number> => {
    let buffer = deps.strategicResourceBufferByPlayer.get(playerId);
    if (!buffer) {
      buffer = emptyStrategicStocks();
      deps.strategicResourceBufferByPlayer.set(playerId, buffer);
    }
    for (const resource of deps.strategicResourceKeys) {
      if (buffer[resource] === undefined) buffer[resource] = 0;
    }
    return buffer;
  };

  const getOrInitTileYield = (tileKey: TileKey): TileYieldBuffer => {
    let yieldBuffer = deps.tileYieldByTile.get(tileKey);
    if (!yieldBuffer) {
      yieldBuffer = emptyTileYield();
      deps.tileYieldByTile.set(tileKey, yieldBuffer);
    }
    for (const resource of deps.strategicResourceKeys) {
      if (yieldBuffer.strategic[resource] === undefined) yieldBuffer.strategic[resource] = 0;
    }
    return yieldBuffer;
  };

  const availableYieldStrategicForPlayer = (player: Player, resource: StrategicResource): number => {
    let total = 0;
    for (const tileKey of player.territoryTiles) {
      if (deps.ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
      const yieldBuffer = deps.tileYieldByTile.get(tileKey);
      if (!yieldBuffer) continue;
      total += Math.max(0, yieldBuffer.strategic[resource] ?? 0);
    }
    return total;
  };

  return {
    getOrInitResourceCounts,
    emptyStrategicStocks,
    emptyTileYield,
    emptyPlayerEconomyIndex,
    getOrInitEconomyIndex,
    getOrInitOwnedTileKeySet,
    trackOwnedTileKey,
    untrackOwnedTileKey,
    ownedStructureCountForPlayer,
    rebuildEconomyIndexForPlayer,
    hasPositiveStrategicBuffer,
    pruneEmptyTileYield,
    roundedPositiveStrategic,
    getOrInitStrategicStocks,
    getOrInitStrategicBuffer,
    getOrInitTileYield,
    availableYieldStrategicForPlayer
  };
};
