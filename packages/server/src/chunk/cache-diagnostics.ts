import type { VisibilitySnapshot } from "./snapshots.js";

export type ChunkSnapshotCacheEntry = {
  visibility: VisibilitySnapshot;
  visibilityVersion: number;
  discoveryVersion: number;
  payloadByChunkKey: Map<string, string>;
  summaryVersionByPayloadKey: Map<string, number>;
  visibilityMaskByChunkKey: Map<string, Uint8Array>;
  visibilityVersionByChunkKey: Map<string, number>;
};

export type ChunkSnapshotPlayerCacheDiagnostics = {
  playerId: string;
  allVisible: boolean;
  payloads: number;
  payloadBytes: number;
  visibilityMasks: number;
  visibilityMaskBytes: number;
  visibilitySnapshotBytes: number;
  approxTotalBytes: number;
};

export type ChunkSnapshotCacheDiagnostics = {
  players: number;
  payloads: number;
  payloadBytes: number;
  visibilityMasks: number;
  visibilityMaskBytes: number;
  visibilitySnapshots: number;
  visibilitySnapshotBytes: number;
  approxPayloadMb: number;
  approxTotalMb: number;
  topPlayers: ChunkSnapshotPlayerCacheDiagnostics[];
};

const utf8Bytes = (value: string): number => Buffer.byteLength(value, "utf8");

const totalPayloadBytes = (payloadByChunkKey: ReadonlyMap<string, string>): number => {
  let bytes = 0;
  for (const payload of payloadByChunkKey.values()) bytes += utf8Bytes(payload);
  return bytes;
};

const totalMaskBytes = (visibilityMaskByChunkKey: ReadonlyMap<string, Uint8Array>): number => {
  let bytes = 0;
  for (const mask of visibilityMaskByChunkKey.values()) bytes += mask.byteLength;
  return bytes;
};

export const summarizeChunkSnapshotPlayerCache = (options: {
  playerId: string;
  cachedChunkSnapshotByPlayer: ReadonlyMap<string, ChunkSnapshotCacheEntry>;
  cachedVisibilitySnapshotByPlayer: ReadonlyMap<string, VisibilitySnapshot>;
}): ChunkSnapshotPlayerCacheDiagnostics => {
  const cachedChunkSnapshot = options.cachedChunkSnapshotByPlayer.get(options.playerId);
  const visibilitySnapshot = options.cachedVisibilitySnapshotByPlayer.get(options.playerId);
  const payloadBytes = cachedChunkSnapshot ? totalPayloadBytes(cachedChunkSnapshot.payloadByChunkKey) : 0;
  const visibilityMaskBytes = cachedChunkSnapshot ? totalMaskBytes(cachedChunkSnapshot.visibilityMaskByChunkKey) : 0;
  const visibilitySnapshotBytes = visibilitySnapshot?.visibleMask.byteLength ?? 0;
  const allVisible = visibilitySnapshot?.allVisible ?? cachedChunkSnapshot?.visibility.allVisible ?? false;
  return {
    playerId: options.playerId,
    allVisible,
    payloads: cachedChunkSnapshot?.payloadByChunkKey.size ?? 0,
    payloadBytes,
    visibilityMasks: cachedChunkSnapshot?.visibilityMaskByChunkKey.size ?? 0,
    visibilityMaskBytes,
    visibilitySnapshotBytes,
    approxTotalBytes: payloadBytes + visibilityMaskBytes + visibilitySnapshotBytes
  };
};

export const summarizeChunkSnapshotCaches = (options: {
  cachedChunkSnapshotByPlayer: ReadonlyMap<string, ChunkSnapshotCacheEntry>;
  cachedVisibilitySnapshotByPlayer: ReadonlyMap<string, VisibilitySnapshot>;
  maxPlayers?: number;
}): ChunkSnapshotCacheDiagnostics => {
  const playerIds = new Set<string>([
    ...options.cachedChunkSnapshotByPlayer.keys(),
    ...options.cachedVisibilitySnapshotByPlayer.keys()
  ]);
  const topPlayers = [...playerIds]
    .map((playerId) =>
      summarizeChunkSnapshotPlayerCache({
        playerId,
        cachedChunkSnapshotByPlayer: options.cachedChunkSnapshotByPlayer,
        cachedVisibilitySnapshotByPlayer: options.cachedVisibilitySnapshotByPlayer
      })
    )
    .sort((a, b) => b.approxTotalBytes - a.approxTotalBytes || a.playerId.localeCompare(b.playerId));

  let payloads = 0;
  let payloadBytes = 0;
  let visibilityMasks = 0;
  let visibilityMaskBytes = 0;
  let visibilitySnapshotBytes = 0;
  for (const cached of options.cachedChunkSnapshotByPlayer.values()) {
    payloads += cached.payloadByChunkKey.size;
    payloadBytes += totalPayloadBytes(cached.payloadByChunkKey);
    visibilityMasks += cached.visibilityMaskByChunkKey.size;
    visibilityMaskBytes += totalMaskBytes(cached.visibilityMaskByChunkKey);
  }
  for (const snapshot of options.cachedVisibilitySnapshotByPlayer.values()) {
    visibilitySnapshotBytes += snapshot.visibleMask.byteLength;
  }
  const approxPayloadMb = payloadBytes / (1024 * 1024);
  const approxTotalMb = (payloadBytes + visibilityMaskBytes + visibilitySnapshotBytes) / (1024 * 1024);
  return {
    players: playerIds.size,
    payloads,
    payloadBytes,
    visibilityMasks,
    visibilityMaskBytes,
    visibilitySnapshots: options.cachedVisibilitySnapshotByPlayer.size,
    visibilitySnapshotBytes,
    approxPayloadMb,
    approxTotalMb,
    topPlayers: topPlayers.slice(0, Math.max(1, options.maxPlayers ?? 5))
  };
};
