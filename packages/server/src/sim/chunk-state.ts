import type {
  ClusterType,
  Dock,
  EconomicStructure,
  Fort,
  OwnershipState,
  RegionType,
  ResourceType,
  SiegeOutpost,
  Tile,
  TileKey
} from "@border-empires/shared";

import type { ChunkSummaryMode } from "../chunk/snapshots.js";

type TownLike = {
  tileKey: TileKey;
  type: NonNullable<Tile["town"]>["type"];
  status?: "under_construction" | "active";
  completesAt?: number;
};

type ObservatoryLike = {
  ownerId: string;
  tileKey: TileKey;
  status: "under_construction" | "active" | "inactive" | "removing";
  completesAt?: number;
};

type ActiveSiphon = {
  casterPlayerId: string;
  endsAt: number;
};

type BreachShock = {
  ownerId: string;
  expiresAt: number;
};

type SummaryChunkCacheEntry = {
  version: number;
  tiles: readonly Tile[];
};

type CreateSimulationChunkStateDeps = {
  worldWidth: number;
  worldHeight: number;
  chunkSize: number;
  now: () => number;
  wrapX: (x: number, mod: number) => number;
  wrapY: (y: number, mod: number) => number;
  chunkKeyAtTile: (x: number, y: number) => string;
  key: (x: number, y: number) => TileKey;
  barbarianOwnerId: string;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  resourceAt: (x: number, y: number) => ResourceType | undefined;
  applyClusterResources: (x: number, y: number, resource: ResourceType | undefined) => ResourceType | undefined;
  clusterByTile: Map<TileKey, string>;
  clustersById: ReadonlyMap<string, { clusterType: ClusterType }>;
  docksByTile: Map<TileKey, Dock>;
  shardSiteViewAt: (tileKey: TileKey) => Tile["shardSite"] | undefined;
  townsByTile: ReadonlyMap<TileKey, unknown>;
  fortsByTile: Map<TileKey, Fort>;
  observatoriesByTile: ReadonlyMap<TileKey, unknown>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  siphonByTile: Map<TileKey, ActiveSiphon>;
  breachShockByTile: Map<TileKey, BreachShock>;
  regionTypeAtLocal: (x: number, y: number) => RegionType | undefined;
  thinTownSummaryForTile: (town: any, ownerId: string | undefined) => NonNullable<Tile["town"]>;
  townSummaryForTile: (town: any, ownerId: string | undefined) => NonNullable<Tile["town"]>;
  observatoryStatusForTile: (ownerId: string, tileKey: TileKey) => NonNullable<Tile["observatory"]>["status"];
  applyTileYieldSummary: (
    tile: Tile,
    x: number,
    y: number,
    ownerId: string | undefined,
    ownershipState: OwnershipState | undefined,
    resource: ResourceType | undefined,
    dock: Dock | undefined,
    town: any,
    terrain: Tile["terrain"]
  ) => void;
  activeSettlementTileKeyForPlayer: (playerId: string) => TileKey | undefined;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  siphonShare: number;
};

export const createSimulationChunkState = (deps: CreateSimulationChunkStateDeps): {
  summaryChunkVersionByChunkKey: Map<string, number>;
  cachedSummaryChunkByChunkKey: Map<string, SummaryChunkCacheEntry>;
  markSummaryChunkDirtyAtTile: (x: number, y: number) => void;
  summaryTileAt: (x: number, y: number, mode?: ChunkSummaryMode) => Tile;
  summaryChunkTiles: (worldCx: number, worldCy: number, mode?: ChunkSummaryMode) => readonly Tile[];
  clear: () => void;
} => {
  const summaryChunkVersionByChunkKey = new Map<string, number>();
  const cachedSummaryChunkByChunkKey = new Map<string, SummaryChunkCacheEntry>();

  const playerTileSummary = (x: number, y: number, mode: ChunkSummaryMode = "thin"): Tile => {
    const wx = deps.wrapX(x, deps.worldWidth);
    const wy = deps.wrapY(y, deps.worldHeight);
    const tk = deps.key(wx, wy);
    const terrain = deps.terrainAtRuntime(wx, wy);
    const ownerId = deps.ownership.get(tk);
    const ownershipState = deps.ownershipStateByTile.get(tk);
    const baseResource = terrain === "LAND" ? deps.resourceAt(wx, wy) : undefined;
    const resource = terrain === "LAND" ? deps.applyClusterResources(wx, wy, baseResource) : undefined;
    const clusterId = deps.clusterByTile.get(tk);
    const clusterType = clusterId ? deps.clustersById.get(clusterId)?.clusterType : undefined;
    const dock = terrain === "LAND" ? deps.docksByTile.get(tk) : undefined;
    const shardSite = terrain === "LAND" ? deps.shardSiteViewAt(tk) : undefined;
    const town = (terrain === "LAND" ? deps.townsByTile.get(tk) : undefined) as TownLike | undefined;
    const fort = terrain === "LAND" ? deps.fortsByTile.get(tk) : undefined;
    const observatory = (terrain === "LAND" ? deps.observatoriesByTile.get(tk) : undefined) as ObservatoryLike | undefined;
    const siegeOutpost = terrain === "LAND" ? deps.siegeOutpostsByTile.get(tk) : undefined;
    const sabotage = deps.siphonByTile.get(tk);
    const breachShock = deps.breachShockByTile.get(tk);
    const regionType = terrain === "LAND" ? deps.regionTypeAtLocal(wx, wy) : undefined;
    const shellMode = mode === "shell";
    const bootstrapMode = mode === "bootstrap" || shellMode;
    const tile: Tile = {
      x: wx,
      y: wy,
      terrain,
      detailLevel: "summary",
      lastChangedAt: mode === "standard" ? deps.now() : 0
    };
    if (resource && !dock && !shellMode) tile.resource = resource;
    if (ownerId) {
      tile.ownerId = ownerId;
      tile.ownershipState = ownershipState ?? (ownerId === deps.barbarianOwnerId ? "BARBARIAN" : "SETTLED");
      if (ownerId !== deps.barbarianOwnerId && deps.activeSettlementTileKeyForPlayer(ownerId) === tk) tile.capital = true;
    }
    if (terrain === "LAND" && clusterType && !shellMode) tile.clusterType = clusterType;
    if (terrain === "LAND" && regionType && !shellMode) tile.regionType = regionType;
    if (dock && !shellMode) tile.dockId = dock.dockId;
    if (terrain === "LAND" && !bootstrapMode) tile.shardSite = shardSite ?? null;
    if (breachShock && breachShock.expiresAt > deps.now() && ownerId === breachShock.ownerId) tile.breachShockUntil = breachShock.expiresAt;
    if (town && !bootstrapMode) tile.town = mode === "thin" ? deps.thinTownSummaryForTile(town, ownerId) : deps.townSummaryForTile(town, ownerId);
    if (fort && !bootstrapMode) {
      const fortView: { ownerId: string; status: "under_construction" | "active" | "removing"; completesAt?: number; disabledUntil?: number } = {
        ownerId: fort.ownerId,
        status: fort.status
      };
      if ((fort.status === "under_construction" || fort.status === "removing") && fort.completesAt !== undefined) {
        fortView.completesAt = fort.completesAt;
      }
      if (fort.disabledUntil !== undefined) fortView.disabledUntil = fort.disabledUntil;
      tile.fort = fortView;
    }
    if (observatory && !bootstrapMode) {
      tile.observatory = {
        ownerId: observatory.ownerId,
        status: mode === "thin" ? observatory.status : deps.observatoryStatusForTile(observatory.ownerId, observatory.tileKey)
      };
      if ((tile.observatory.status === "under_construction" || tile.observatory.status === "removing") && observatory.completesAt !== undefined) {
        tile.observatory.completesAt = observatory.completesAt;
      }
    }
    if (siegeOutpost && !bootstrapMode) {
      const siegeView: { ownerId: string; status: "under_construction" | "active" | "removing"; completesAt?: number } = {
        ownerId: siegeOutpost.ownerId,
        status: siegeOutpost.status
      };
      if ((siegeOutpost.status === "under_construction" || siegeOutpost.status === "removing") && siegeOutpost.completesAt !== undefined) {
        siegeView.completesAt = siegeOutpost.completesAt;
      }
      tile.siegeOutpost = siegeView;
    }
    if (sabotage && sabotage.endsAt > deps.now() && !bootstrapMode) {
      tile.sabotage = {
        ownerId: sabotage.casterPlayerId,
        endsAt: sabotage.endsAt,
        outputMultiplier: 1 - deps.siphonShare
      };
    }
    const economicStructure = deps.economicStructuresByTile.get(tk);
    if (economicStructure && !bootstrapMode) {
      const economicStructureView: NonNullable<Tile["economicStructure"]> = {
        ownerId: economicStructure.ownerId,
        type: economicStructure.type,
        status: economicStructure.status
      };
      if (economicStructure.inactiveReason !== undefined) economicStructureView.inactiveReason = economicStructure.inactiveReason;
      if (economicStructure.disabledUntil !== undefined) economicStructureView.disabledUntil = economicStructure.disabledUntil;
      if ((economicStructure.status === "under_construction" || economicStructure.status === "removing") && economicStructure.completesAt !== undefined) {
        economicStructureView.completesAt = economicStructure.completesAt;
      }
      tile.economicStructure = economicStructureView;
    }
    if (!bootstrapMode) {
      deps.applyTileYieldSummary(tile, wx, wy, ownerId, ownershipState, resource, dock, town, terrain);
    }
    tile.fogged = false;
    return tile;
  };

  const summaryChunkTiles = (worldCx: number, worldCy: number, mode: ChunkSummaryMode = "thin"): readonly Tile[] => {
    const chunkKey = `${worldCx},${worldCy}`;
    const summaryCacheKey = `${mode}:${chunkKey}`;
    const version = summaryChunkVersionByChunkKey.get(chunkKey) ?? 0;
    const cached = cachedSummaryChunkByChunkKey.get(summaryCacheKey);
    if (cached?.version === version) return cached.tiles;
    const startX = worldCx * deps.chunkSize;
    const startY = worldCy * deps.chunkSize;
    const tiles: Tile[] = [];
    for (let y = startY; y < startY + deps.chunkSize; y += 1) {
      for (let x = startX; x < startX + deps.chunkSize; x += 1) {
        tiles.push(Object.freeze(playerTileSummary(x, y, mode)));
      }
    }
    cachedSummaryChunkByChunkKey.set(summaryCacheKey, { version, tiles });
    return tiles;
  };

  return {
    summaryChunkVersionByChunkKey,
    cachedSummaryChunkByChunkKey,
    markSummaryChunkDirtyAtTile: (x, y) => {
      const chunkKey = deps.chunkKeyAtTile(x, y);
      summaryChunkVersionByChunkKey.set(chunkKey, (summaryChunkVersionByChunkKey.get(chunkKey) ?? 0) + 1);
      cachedSummaryChunkByChunkKey.delete(`shell:${chunkKey}`);
      cachedSummaryChunkByChunkKey.delete(`bootstrap:${chunkKey}`);
      cachedSummaryChunkByChunkKey.delete(`thin:${chunkKey}`);
      cachedSummaryChunkByChunkKey.delete(`standard:${chunkKey}`);
    },
    summaryTileAt: playerTileSummary,
    summaryChunkTiles,
    clear: () => {
      summaryChunkVersionByChunkKey.clear();
      cachedSummaryChunkByChunkKey.clear();
    }
  };
};
