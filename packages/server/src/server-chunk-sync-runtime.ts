import type { Player, Tile } from "@border-empires/shared";
import { createChunkReadManager } from "./sim/chunk-read-manager.js";
import type { ChunkReadRequest } from "./sim/chunk-read-shared.js";
import {
  createChunkSnapshotController,
  type ChunkFollowUpStage,
  type ChunkSummaryMode,
  type VisibilitySnapshot
} from "./chunk/snapshots.js";
import type { ChunkBuildInput } from "./chunk/serializer-shared.js";

type RuntimeMemoryStats = {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  arrayBuffersMb: number;
};

type ChunkSnapshotPerfSample = {
  at: number;
  playerId: string;
  elapsedMs: number;
  chunks: number;
  tiles: number;
  radius: number;
  rssMb: number;
  heapUsedMb: number;
  visibilityMaskMs: number;
  summaryReadMs: number;
  serializeMs: number;
  sendMs: number;
  cachedPayloadChunks: number;
  rebuiltChunks: number;
  batches: number;
};

type AuthSyncTiming = {
  authVerifiedAt?: number;
  initSentAt?: number;
  firstSubscribeAt?: number;
  firstChunkSentAt?: number;
};

export interface CreateServerChunkSyncRuntimeDeps {
  CHUNK_READ_WORKER_ENABLED: boolean;
  CHUNK_SIZE: number;
  CHUNK_STREAM_BATCH_SIZE: number;
  CHUNK_SNAPSHOT_BATCH_SIZE: number;
  CHUNK_SNAPSHOT_BUDGET_MS: number;
  CHUNK_SNAPSHOT_WARN_MS: number;
  CHUNK_SNAPSHOT_YIELD_MS: number;
  CHUNK_SNAPSHOT_OVERLOAD_YIELD_MS: number;
  INITIAL_CHUNK_BOOTSTRAP_RADIUS: number;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  now: () => number;
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  key: (x: number, y: number) => string;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  players: Map<string, Player>;
  socketsByPlayer: Map<string, { readyState: number; OPEN: number }>;
  docksByTile: Map<string, { dockId: string }>;
  clusterByTile: Map<string, string>;
  clustersById: Map<string, { clusterType?: Tile["clusterType"] }>;
  authSyncTimingByPlayer: Map<string, AuthSyncTiming>;
  cachedChunkSnapshotByPlayer: Map<
    string,
    {
      visibility: VisibilitySnapshot;
      visibilityVersion: number;
      payloadByChunkKey: Map<string, string>;
      summaryVersionByPayloadKey: Map<string, number>;
      visibilityMaskByChunkKey: Map<string, Uint8Array>;
      visibilityVersionByChunkKey: Map<string, number>;
    }
  >;
  fogChunkTilesByChunkKey: Map<string, readonly Tile[]>;
  chunkSnapshotGenerationByPlayer: Map<string, number>;
  chunkSnapshotInFlightByPlayer: Map<string, number>;
  pendingChunkRefreshByPlayer: Set<string>;
  chunkSnapshotSentAtByPlayer: Map<string, { cx: number; cy: number; radius: number; sentAt: number }>;
  chunkSubscriptionByPlayer: Map<string, { cx: number; cy: number; radius: number }>;
  summaryChunkTiles: (worldCx: number, worldCy: number, mode: ChunkSummaryMode) => readonly Tile[];
  summaryTileAt: (x: number, y: number, mode: ChunkSummaryMode) => Tile;
  summaryChunkVersionByChunkKey: Map<string, number>;
  visibilitySnapshotForPlayer: (player: Player) => VisibilitySnapshot;
  visibleInSnapshot: (snapshot: VisibilitySnapshot, x: number, y: number) => boolean;
  runtimeMemoryStats: () => RuntimeMemoryStats;
  logRuntimeError: (message: string, error: unknown) => void;
  pushChunkSnapshotPerf: (sample: ChunkSnapshotPerfSample) => void;
  onFirstChunkSent: (event: { playerId: string; chunkCount: number; tileCount: number; radius: number }) => void;
  onSlowChunkSnapshot: (event: {
    playerId: string;
    elapsedMs: number;
    chunks: number;
    tiles: number;
    radius: number;
    phases: Omit<ChunkSnapshotPerfSample, "at" | "playerId" | "elapsedMs" | "chunks" | "tiles" | "radius" | "rssMb" | "heapUsedMb">;
    memory: RuntimeMemoryStats;
  }) => void;
  serializeChunkBatchViaWorker: (inputs: ChunkBuildInput[]) => Promise<string[]>;
  serializeChunkBatchDirect: (inputs: ChunkBuildInput[]) => string[];
  serializeChunkBatchBodies: (generation: number, chunkBodies: string[]) => string;
  sendChunkBatchPayload: (socket: { readyState: number; OPEN: number; send: (payload: string) => void }, payload: string) => void;
  runtimeLoadShedLevel: () => "normal" | "soft" | "hard";
  bulkSocketForPlayer: (playerId: string) => { readyState: number; OPEN: number; send: (payload: string) => void } | undefined;
  humanFrontierActionPriorityActive?: () => boolean;
}

export interface ServerChunkSyncRuntime {
  chunkReadManager: ReturnType<typeof createChunkReadManager>;
  chunkReadWorkerState: ReturnType<typeof createChunkReadManager>["state"];
  chunkCoordsForSubscription: ReturnType<typeof createChunkSnapshotController<Player>>["chunkCoordsForSubscription"];
  buildBootstrapChunkStages: ReturnType<typeof createChunkSnapshotController<Player>>["buildBootstrapChunkStages"];
  sendChunkSnapshot: ReturnType<typeof createChunkSnapshotController<Player>>["sendChunkSnapshot"];
  tileInSubscription: ReturnType<typeof createChunkSnapshotController<Player>>["tileInSubscription"];
  refreshSubscribedViewForPlayer: (playerId: string) => void;
}

export const createServerChunkSyncRuntime = (
  deps: CreateServerChunkSyncRuntimeDeps
): ServerChunkSyncRuntime => {
  const chunkCountX = Math.ceil(deps.WORLD_WIDTH / deps.CHUNK_SIZE);
  const chunkCountY = Math.ceil(deps.WORLD_HEIGHT / deps.CHUNK_SIZE);
  const wrapChunkX = (cx: number): number => ((cx % chunkCountX) + chunkCountX) % chunkCountX;
  const wrapChunkY = (cy: number): number => ((cy % chunkCountY) + chunkCountY) % chunkCountY;

  const chunkReadManager = createChunkReadManager({
    enabled: deps.CHUNK_READ_WORKER_ENABLED,
    now: deps.now,
    chunkCountX,
    chunkCountY,
    chunkSize: deps.CHUNK_SIZE,
    onError: deps.logRuntimeError,
    loadChunkTilesLocal: (cx, cy, mode) => deps.summaryChunkTiles(cx, cy, mode),
    loadChunkTileLocal: (x, y, mode) => deps.summaryTileAt(x, y, mode)
  });

  const chunkSnapshotControllerDeps = {
    chunkSize: deps.CHUNK_SIZE,
    chunkCountX,
    chunkCountY,
    initialBootstrapRadius: deps.INITIAL_CHUNK_BOOTSTRAP_RADIUS,
    chunkStreamBatchSize: deps.CHUNK_STREAM_BATCH_SIZE,
    chunkSnapshotBatchSize: deps.CHUNK_SNAPSHOT_BATCH_SIZE,
    chunkSnapshotBudgetMs: deps.CHUNK_SNAPSHOT_BUDGET_MS,
    chunkSnapshotWarnMs: deps.CHUNK_SNAPSHOT_WARN_MS,
    chunkSnapshotYieldMs: deps.CHUNK_SNAPSHOT_YIELD_MS,
    chunkSnapshotOverloadYieldMs: deps.CHUNK_SNAPSHOT_OVERLOAD_YIELD_MS,
    now: deps.now,
    wrapChunkX,
    wrapChunkY,
    runtimeMemoryStats: deps.runtimeMemoryStats,
    pushChunkSnapshotPerf: deps.pushChunkSnapshotPerf,
    onFirstChunkSent: deps.onFirstChunkSent,
    onSlowChunkSnapshot: deps.onSlowChunkSnapshot,
    visibilitySnapshotForPlayer: deps.visibilitySnapshotForPlayer,
    cachedChunkSnapshotByPlayer: deps.cachedChunkSnapshotByPlayer,
    fogChunkTilesByChunkKey: deps.fogChunkTilesByChunkKey,
    chunkSnapshotGenerationByPlayer: deps.chunkSnapshotGenerationByPlayer,
    chunkSnapshotInFlightByPlayer: deps.chunkSnapshotInFlightByPlayer,
    pendingChunkRefreshByPlayer: deps.pendingChunkRefreshByPlayer,
    chunkSnapshotSentAtByPlayer: deps.chunkSnapshotSentAtByPlayer,
    chunkSubscriptionByPlayer: deps.chunkSubscriptionByPlayer,
    bulkSocketForPlayer: deps.bulkSocketForPlayer,
    authSyncTimingByPlayer: deps.authSyncTimingByPlayer,
    fogChunkTiles: (worldCx: number, worldCy: number) => {
      const chunkKey = `${worldCx},${worldCy}`;
      const cached = deps.fogChunkTilesByChunkKey.get(chunkKey);
      if (cached) return cached;
      const startX = worldCx * deps.CHUNK_SIZE;
      const startY = worldCy * deps.CHUNK_SIZE;
      const tiles: Tile[] = [];
      for (let y = startY; y < startY + deps.CHUNK_SIZE; y += 1) {
        for (let x = startX; x < startX + deps.CHUNK_SIZE; x += 1) {
          const wx = deps.wrapX(x, deps.WORLD_WIDTH);
          const wy = deps.wrapY(y, deps.WORLD_HEIGHT);
          const tileKey = deps.key(wx, wy);
          const fogTile: Tile = {
            x: wx,
            y: wy,
            terrain: deps.terrainAtRuntime(wx, wy),
            fogged: true,
            lastChangedAt: 0
          };
          const dock = deps.docksByTile.get(tileKey);
          const clusterId = deps.clusterByTile.get(tileKey);
          const clusterType = clusterId ? deps.clustersById.get(clusterId)?.clusterType : undefined;
          if (dock) fogTile.dockId = dock.dockId;
          if (clusterId) fogTile.clusterId = clusterId;
          if (clusterType) fogTile.clusterType = clusterType;
          tiles.push(Object.freeze(fogTile));
        }
      }
      deps.fogChunkTilesByChunkKey.set(chunkKey, tiles);
      return tiles;
    },
    summaryChunkTiles: deps.summaryChunkTiles,
    summaryChunkVersion: (worldCx: number, worldCy: number) => deps.summaryChunkVersionByChunkKey.get(`${worldCx},${worldCy}`) ?? 0,
    loadSummaryChunkTilesBatch: (requests: ChunkReadRequest[]) => chunkReadManager.loadBatch(requests),
    visibleInSnapshot: deps.visibleInSnapshot,
    wrapX: deps.wrapX,
    wrapY: deps.wrapY,
    worldWidth: deps.WORLD_WIDTH,
    worldHeight: deps.WORLD_HEIGHT,
    serializeChunkBatchViaWorker: deps.serializeChunkBatchViaWorker,
    serializeChunkBatchDirect: deps.serializeChunkBatchDirect,
    serializeChunkBatchBodies: deps.serializeChunkBatchBodies,
    sendChunkBatchPayload: deps.sendChunkBatchPayload,
    runtimeLoadShedLevel: deps.runtimeLoadShedLevel,
    ...(deps.humanFrontierActionPriorityActive
      ? { humanFrontierActionPriorityActive: deps.humanFrontierActionPriorityActive }
      : {})
  };

  const {
    chunkCoordsForSubscription,
    buildBootstrapChunkStages,
    sendChunkSnapshot,
    tileInSubscription
  } = createChunkSnapshotController<Player>(chunkSnapshotControllerDeps);

  const refreshSubscribedViewForPlayer = (playerId: string): void => {
    const socket = deps.bulkSocketForPlayer(playerId);
    const player = deps.players.get(playerId);
    const sub = deps.chunkSubscriptionByPlayer.get(playerId);
    if (!socket || socket.readyState !== socket.OPEN || !player || !sub) return;
    if (deps.chunkSnapshotInFlightByPlayer.has(playerId)) {
      deps.pendingChunkRefreshByPlayer.add(playerId);
      return;
    }
    sendChunkSnapshot(socket, player, sub);
  };

  return {
    chunkReadManager,
    chunkReadWorkerState: chunkReadManager.state,
    chunkCoordsForSubscription,
    buildBootstrapChunkStages,
    sendChunkSnapshot,
    tileInSubscription,
    refreshSubscribedViewForPlayer
  };
};
