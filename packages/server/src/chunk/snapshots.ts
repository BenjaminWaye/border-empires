import type { Player, Tile } from "@border-empires/shared";
import type { ChunkBuildInput } from "./serializer-shared.js";

export type VisibilitySnapshot = {
  allVisible: boolean;
  visibleMask: Uint8Array;
};

export type ChunkSummaryMode = "shell" | "bootstrap" | "thin" | "standard";

export type ChunkFollowUpStage = {
  sub: { cx: number; cy: number; radius: number };
  chunkCoords: Array<{ cx: number; cy: number }>;
  summaryMode: ChunkSummaryMode;
  batchSize: number;
  next?: ChunkFollowUpStage;
};

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
};

type ChunkSnapshotCacheEntry = {
  visibility: VisibilitySnapshot;
  payloadByChunkKey: Map<string, string>;
  visibilityMaskByChunkKey: Map<string, Uint8Array>;
};

type SocketLike = {
  readyState: number;
  OPEN: number;
  send: (payload: string) => void;
};

type CreateChunkSnapshotControllerDeps<TPlayer extends Player> = {
  chunkSize: number;
  chunkCountX: number;
  chunkCountY: number;
  initialBootstrapRadius: number;
  chunkStreamBatchSize: number;
  chunkSnapshotBatchSize: number;
  chunkSnapshotWarnMs: number;
  now: () => number;
  wrapChunkX: (value: number) => number;
  wrapChunkY: (value: number) => number;
  runtimeMemoryStats: () => RuntimeMemoryStats;
  pushChunkSnapshotPerf: (sample: ChunkSnapshotPerfSample) => void;
  onFirstChunkSent: (event: { playerId: string; chunkCount: number; tileCount: number; radius: number }) => void;
  onSlowChunkSnapshot: (event: {
    playerId: string;
    elapsedMs: number;
    chunks: number;
    tiles: number;
    radius: number;
    memory: RuntimeMemoryStats;
  }) => void;
  visibilitySnapshotForPlayer: (player: TPlayer) => VisibilitySnapshot;
  cachedChunkSnapshotByPlayer: Map<string, ChunkSnapshotCacheEntry>;
  fogChunkTilesByChunkKey: Map<string, readonly Tile[]>;
  chunkSnapshotGenerationByPlayer: Map<string, number>;
  chunkSnapshotInFlightByPlayer: Map<string, number>;
  chunkSnapshotSentAtByPlayer: Map<string, { cx: number; cy: number; radius: number; sentAt: number }>;
  chunkSubscriptionByPlayer: Map<string, { cx: number; cy: number; radius: number }>;
  authSyncTimingByPlayer: Map<
    string,
    {
      authVerifiedAt?: number;
      initSentAt?: number;
      firstSubscribeAt?: number;
      firstChunkSentAt?: number;
    }
  >;
  fogChunkTiles: (worldCx: number, worldCy: number) => readonly Tile[];
  summaryChunkTiles: (worldCx: number, worldCy: number, mode: ChunkSummaryMode) => readonly Tile[];
  visibleInSnapshot: (snapshot: VisibilitySnapshot, x: number, y: number) => boolean;
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  worldWidth: number;
  worldHeight: number;
  serializeChunkBatchViaWorker: (inputs: ChunkBuildInput[]) => Promise<string[]>;
  serializeChunkBatchBodies: (chunkBodies: string[]) => string;
};

const chunkDist = (a: number, b: number, mod: number): number => {
  const d = Math.abs(a - b);
  return Math.min(d, mod - d);
};

export const createChunkSnapshotController = <TPlayer extends Player>(
  deps: CreateChunkSnapshotControllerDeps<TPlayer>
): {
  chunkCoordsForSubscription: (
    sub: { cx: number; cy: number; radius: number },
    minChebyshevRadius?: number
  ) => Array<{ cx: number; cy: number }>;
  buildBootstrapChunkStages: (sub: { cx: number; cy: number; radius: number }) => ChunkFollowUpStage | undefined;
  sendChunkSnapshot: (
    socket: SocketLike,
    actor: TPlayer,
    sub: { cx: number; cy: number; radius: number },
    followUpStage?: ChunkFollowUpStage,
    chunkCoordsOverride?: Array<{ cx: number; cy: number }>,
    summaryMode?: ChunkSummaryMode,
    batchSizeOverride?: number
  ) => void;
  tileInSubscription: (playerId: string, x: number, y: number) => boolean;
  clearPlayer: (playerId: string) => void;
} => {
  const chunkCoordsForSubscription = (
    sub: { cx: number; cy: number; radius: number },
    minChebyshevRadius = 0
  ): Array<{ cx: number; cy: number }> => {
    const coords: Array<{ cx: number; cy: number }> = [];
    for (let cy = sub.cy - sub.radius; cy <= sub.cy + sub.radius; cy += 1) {
      for (let cx = sub.cx - sub.radius; cx <= sub.cx + sub.radius; cx += 1) {
        const wrappedCx = deps.wrapChunkX(cx);
        const wrappedCy = deps.wrapChunkY(cy);
        const distance = Math.max(
          chunkDist(wrappedCx, deps.wrapChunkX(sub.cx), deps.chunkCountX),
          chunkDist(wrappedCy, deps.wrapChunkY(sub.cy), deps.chunkCountY)
        );
        if (distance < minChebyshevRadius) continue;
        coords.push({ cx: wrappedCx, cy: wrappedCy });
      }
    }
    coords.sort((a, b) => {
      const adx = chunkDist(a.cx, deps.wrapChunkX(sub.cx), deps.chunkCountX);
      const ady = chunkDist(a.cy, deps.wrapChunkY(sub.cy), deps.chunkCountY);
      const bdx = chunkDist(b.cx, deps.wrapChunkX(sub.cx), deps.chunkCountX);
      const bdy = chunkDist(b.cy, deps.wrapChunkY(sub.cy), deps.chunkCountY);
      const aChebyshev = Math.max(adx, ady);
      const bChebyshev = Math.max(bdx, bdy);
      if (aChebyshev !== bChebyshev) return aChebyshev - bChebyshev;
      const aManhattan = adx + ady;
      const bManhattan = bdx + bdy;
      if (aManhattan !== bManhattan) return aManhattan - bManhattan;
      if (a.cy !== b.cy) return a.cy - b.cy;
      return a.cx - b.cx;
    });
    return coords;
  };

  const chunkSnapshotCacheForPlayer = (
    playerId: string,
    visibility: VisibilitySnapshot
  ): {
    payloadByChunkKey: Map<string, string>;
    visibilityMaskByChunkKey: Map<string, Uint8Array>;
  } => {
    const cached = deps.cachedChunkSnapshotByPlayer.get(playerId);
    if (cached?.visibility === visibility) {
      return {
        payloadByChunkKey: cached.payloadByChunkKey,
        visibilityMaskByChunkKey: cached.visibilityMaskByChunkKey
      };
    }
    const payloadByChunkKey = new Map<string, string>();
    const visibilityMaskByChunkKey = new Map<string, Uint8Array>();
    deps.cachedChunkSnapshotByPlayer.set(playerId, { visibility, payloadByChunkKey, visibilityMaskByChunkKey });
    return { payloadByChunkKey, visibilityMaskByChunkKey };
  };

  const chunkVisibilityMask = (
    playerId: string,
    snapshot: VisibilitySnapshot,
    worldCx: number,
    worldCy: number
  ): Uint8Array => {
    const chunkKey = `${worldCx},${worldCy}`;
    const cache = chunkSnapshotCacheForPlayer(playerId, snapshot);
    const cachedMask = cache.visibilityMaskByChunkKey.get(chunkKey);
    if (cachedMask) return cachedMask;
    const startX = worldCx * deps.chunkSize;
    const startY = worldCy * deps.chunkSize;
    const mask = new Uint8Array(deps.chunkSize * deps.chunkSize);
    let index = 0;
    for (let y = startY; y < startY + deps.chunkSize; y += 1) {
      for (let x = startX; x < startX + deps.chunkSize; x += 1) {
        const wx = deps.wrapX(x, deps.worldWidth);
        const wy = deps.wrapY(y, deps.worldHeight);
        mask[index] = deps.visibleInSnapshot(snapshot, wx, wy) ? 1 : 0;
        index += 1;
      }
    }
    cache.visibilityMaskByChunkKey.set(chunkKey, mask);
    return mask;
  };

  const chunkSnapshotPayload = (
    actor: TPlayer,
    snapshot: VisibilitySnapshot,
    worldCx: number,
    worldCy: number,
    mode: ChunkSummaryMode
  ): { buildInput?: ChunkBuildInput; payload?: string; tileCount: number; chunkKey: string } => {
    const cache = chunkSnapshotCacheForPlayer(actor.id, snapshot);
    const chunkKey = `${worldCx},${worldCy}`;
    const payloadCacheKey = `${mode}:${chunkKey}`;
    const cachedPayload = cache.payloadByChunkKey.get(payloadCacheKey);
    if (cachedPayload) {
      return {
        payload: cachedPayload,
        tileCount: deps.chunkSize * deps.chunkSize,
        chunkKey: payloadCacheKey
      };
    }

    return {
      buildInput: {
        cx: worldCx,
        cy: worldCy,
        fogTiles: [...deps.fogChunkTiles(worldCx, worldCy)],
        visibleTiles: [...deps.summaryChunkTiles(worldCx, worldCy, mode)],
        visibleMask: chunkVisibilityMask(actor.id, snapshot, worldCx, worldCy)
      },
      tileCount: deps.chunkSize * deps.chunkSize,
      chunkKey: payloadCacheKey
    };
  };

  const buildBootstrapChunkStages = (sub: { cx: number; cy: number; radius: number }): ChunkFollowUpStage | undefined => {
    if (sub.radius <= deps.initialBootstrapRadius) return undefined;
    const stageRadii: number[] = [];
    for (let radius = deps.initialBootstrapRadius + 1; radius <= sub.radius; radius += 1) {
      stageRadii.push(radius);
    }
    let next: ChunkFollowUpStage | undefined;
    for (let index = stageRadii.length - 1; index >= 0; index -= 1) {
      const radius = stageRadii[index]!;
      next = {
        sub: { ...sub, radius },
        chunkCoords: chunkCoordsForSubscription({ ...sub, radius }, radius),
        summaryMode: radius === deps.initialBootstrapRadius + 1 ? "thin" : "shell",
        batchSize: 1,
        ...(next ? { next } : {})
      };
    }
    return next;
  };

  const chunkBatchSizeForSnapshot = (
    chunkCoords: Array<{ cx: number; cy: number }>,
    followUpStage: ChunkFollowUpStage | undefined,
    batchSizeOverride?: number
  ): number => {
    if (batchSizeOverride !== undefined) return Math.max(1, batchSizeOverride);
    if (followUpStage || chunkCoords.length > deps.chunkSnapshotBatchSize) return 1;
    return Math.max(1, Math.min(deps.chunkStreamBatchSize, deps.chunkSnapshotBatchSize));
  };

  const sendChunkSnapshot = (
    socket: SocketLike,
    actor: TPlayer,
    sub: { cx: number; cy: number; radius: number },
    followUpStage?: ChunkFollowUpStage,
    chunkCoordsOverride?: Array<{ cx: number; cy: number }>,
    summaryMode: ChunkSummaryMode = "thin",
    batchSizeOverride?: number
  ): void => {
    const startedAt = deps.now();
    const authSync = deps.authSyncTimingByPlayer.get(actor.id);
    const snapshot = deps.visibilitySnapshotForPlayer(actor);
    const generation = (deps.chunkSnapshotGenerationByPlayer.get(actor.id) ?? 0) + 1;
    deps.chunkSnapshotGenerationByPlayer.set(actor.id, generation);
    deps.chunkSnapshotInFlightByPlayer.set(actor.id, generation);
    deps.chunkSnapshotSentAtByPlayer.set(actor.id, { cx: sub.cx, cy: sub.cy, radius: sub.radius, sentAt: deps.now() });
    let chunkCount = 0;
    let tileCount = 0;
    const chunkCoords = chunkCoordsOverride ?? chunkCoordsForSubscription(sub);
    const batchSize = chunkBatchSizeForSnapshot(chunkCoords, followUpStage, batchSizeOverride);

    let index = 0;
    const clearInFlight = (): void => {
      if (deps.chunkSnapshotInFlightByPlayer.get(actor.id) === generation) {
        deps.chunkSnapshotInFlightByPlayer.delete(actor.id);
      }
    };

    const streamNext = async (): Promise<void> => {
      if (deps.chunkSnapshotGenerationByPlayer.get(actor.id) !== generation) {
        clearInFlight();
        return;
      }
      if (socket.readyState !== socket.OPEN) {
        clearInFlight();
        return;
      }

      const chunkBatchBodies: string[] = [];
      const pendingBuilds: Array<{ chunkKey: string; buildInput: ChunkBuildInput }> = [];
      const end = Math.min(index + batchSize, chunkCoords.length);
      for (; index < end; index += 1) {
        const coords = chunkCoords[index]!;
        const chunk = chunkSnapshotPayload(actor, snapshot, coords.cx, coords.cy, summaryMode);
        if (chunk.payload) {
          chunkBatchBodies.push(chunk.payload);
        } else if (chunk.buildInput) {
          pendingBuilds.push({ chunkKey: chunk.chunkKey, buildInput: chunk.buildInput });
        }
        chunkCount += 1;
        tileCount += chunk.tileCount;
      }

      if (pendingBuilds.length > 0) {
        const payloads = await deps.serializeChunkBatchViaWorker(pendingBuilds.map((chunk) => chunk.buildInput));
        const payloadCache = chunkSnapshotCacheForPlayer(actor.id, snapshot).payloadByChunkKey;
        for (let payloadIndex = 0; payloadIndex < payloads.length; payloadIndex += 1) {
          const pending = pendingBuilds[payloadIndex]!;
          const payload = payloads[payloadIndex]!;
          payloadCache.set(pending.chunkKey, payload);
          chunkBatchBodies.push(payload);
        }
      }

      if (chunkBatchBodies.length > 0) {
        socket.send(deps.serializeChunkBatchBodies(chunkBatchBodies));
      }
      if (index < chunkCoords.length) {
        setTimeout(() => {
          void streamNext();
        }, 0);
        return;
      }

      const elapsed = deps.now() - startedAt;
      const memory = deps.runtimeMemoryStats();
      if (authSync && authSync.firstChunkSentAt === undefined) {
        authSync.firstChunkSentAt = deps.now();
        deps.onFirstChunkSent({
          playerId: actor.id,
          chunkCount,
          tileCount,
          radius: sub.radius
        });
      }
      deps.pushChunkSnapshotPerf({
        at: deps.now(),
        playerId: actor.id,
        elapsedMs: elapsed,
        chunks: chunkCount,
        tiles: tileCount,
        radius: sub.radius,
        rssMb: memory.rssMb,
        heapUsedMb: memory.heapUsedMb
      });
      if (elapsed >= deps.chunkSnapshotWarnMs) {
        deps.onSlowChunkSnapshot({
          playerId: actor.id,
          elapsedMs: elapsed,
          chunks: chunkCount,
          tiles: tileCount,
          radius: sub.radius,
          memory
        });
      }
      clearInFlight();
      if (
        followUpStage &&
        socket.readyState === socket.OPEN &&
        deps.chunkSnapshotGenerationByPlayer.get(actor.id) === generation
      ) {
        setTimeout(() => {
          if (socket.readyState !== socket.OPEN) return;
          const currentSub = deps.chunkSubscriptionByPlayer.get(actor.id);
          if (!currentSub) return;
          if (
            currentSub.cx !== followUpStage.sub.cx ||
            currentSub.cy !== followUpStage.sub.cy ||
            currentSub.radius < followUpStage.sub.radius
          ) {
            return;
          }
          sendChunkSnapshot(
            socket,
            actor,
            followUpStage.sub,
            followUpStage.next,
            followUpStage.chunkCoords,
            followUpStage.summaryMode,
            followUpStage.batchSize
          );
        }, 0);
      }
    };

    void streamNext();
  };

  const tileInSubscription = (playerId: string, x: number, y: number): boolean => {
    const sub = deps.chunkSubscriptionByPlayer.get(playerId);
    if (!sub) return false;
    const tcx = deps.wrapChunkX(Math.floor(x / deps.chunkSize));
    const tcy = deps.wrapChunkY(Math.floor(y / deps.chunkSize));
    const scx = deps.wrapChunkX(sub.cx);
    const scy = deps.wrapChunkY(sub.cy);
    return (
      chunkDist(tcx, scx, deps.chunkCountX) <= sub.radius &&
      chunkDist(tcy, scy, deps.chunkCountY) <= sub.radius
    );
  };

  const clearPlayer = (playerId: string): void => {
    deps.chunkSnapshotGenerationByPlayer.delete(playerId);
    deps.chunkSnapshotInFlightByPlayer.delete(playerId);
    deps.chunkSnapshotSentAtByPlayer.delete(playerId);
  };

  return {
    chunkCoordsForSubscription,
    buildBootstrapChunkStages,
    sendChunkSnapshot,
    tileInSubscription,
    clearPlayer
  };
};
