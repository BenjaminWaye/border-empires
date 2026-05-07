import type { PlayerSubscriptionSnapshot } from "./index.js";

export type PlayerSubscriptionSnapshotMeasure = {
  tileCount: number;
  docksCount: number;
  snapshotJsonBytes: number;
  tilesJsonBytes: number;
  playerJsonBytes: number;
  worldStatusJsonBytes: number;
  seasonJsonBytes: number;
  docksJsonBytes: number;
};

export type PlayerSubscriptionSnapshotCacheEntry = {
  playerId: string;
  snapshotJsonBytes: number;
  tileCount: number;
};

export type PlayerSubscriptionSnapshotCacheSummary = {
  entryCount: number;
  totalSnapshotJsonBytes: number;
  totalNonTileJsonBytes: number;
  uniqueTilesJsonBytes: number;
  uniqueTileArrayCount: number;
  topEntries: PlayerSubscriptionSnapshotCacheEntry[];
};

const utf8Encoder = new TextEncoder();

const jsonByteSizeByObject = new WeakMap<object, number>();

// Memoizes by reference for object inputs. Late-game with N fullVisibility
// players the simulation hands them all the same `snapshot.tiles` array
// (sharedFullVisibilityTilesCache in apps/simulation/src/simulation-service.ts)
// but distinct outer snapshots — keying on object identity collapses N
// stringifies of the shared array down to one. Primitives bypass the memo.
export const jsonByteSize = (value: unknown): number => {
  if (value !== null && typeof value === "object") {
    const memoized = jsonByteSizeByObject.get(value as object);
    if (memoized !== undefined) return memoized;
    const size = utf8Encoder.encode(JSON.stringify(value)).length;
    jsonByteSizeByObject.set(value as object, size);
    return size;
  }
  return utf8Encoder.encode(JSON.stringify(value)).length;
};

// Memo correctness depends on snapshot writers REPLACING the outer object
// (see applyTileDeltasToSnapshot / applyPlayerMessageToSnapshot in
// apps/realtime-gateway/src/subscription-snapshot-sync.ts — both spread into
// a new object). A future writer that mutates a snapshot in place would
// silently return stale measurements; don't add one without invalidating
// this cache.
const measureCache = new WeakMap<PlayerSubscriptionSnapshot, PlayerSubscriptionSnapshotMeasure>();

export const measurePlayerSubscriptionSnapshot = (
  snapshot: PlayerSubscriptionSnapshot
): PlayerSubscriptionSnapshotMeasure => {
  const memoized = measureCache.get(snapshot);
  if (memoized) return memoized;
  const tilesJsonBytes = jsonByteSize(snapshot.tiles);
  const playerJsonBytes = snapshot.player ? jsonByteSize(snapshot.player) : 0;
  const worldStatusJsonBytes = snapshot.worldStatus ? jsonByteSize(snapshot.worldStatus) : 0;
  const seasonJsonBytes = snapshot.season ? jsonByteSize(snapshot.season) : 0;
  const docksJsonBytes = snapshot.docks?.length ? jsonByteSize(snapshot.docks) : 0;
  // Derived rather than stringifying the whole 200k-tile snapshot a second
  // time. Approximate (excludes JSON structural overhead and small fields
  // like playerId) but the caller subtracts tilesJsonBytes from this to get
  // non-tile bytes anyway, so the approximation is symmetric.
  const snapshotJsonBytes = tilesJsonBytes + playerJsonBytes + worldStatusJsonBytes + seasonJsonBytes + docksJsonBytes;
  const measure: PlayerSubscriptionSnapshotMeasure = {
    tileCount: snapshot.tiles.length,
    docksCount: snapshot.docks?.length ?? 0,
    snapshotJsonBytes,
    tilesJsonBytes,
    playerJsonBytes,
    worldStatusJsonBytes,
    seasonJsonBytes,
    docksJsonBytes
  };
  measureCache.set(snapshot, measure);
  return measure;
};

export const summarizePlayerSubscriptionSnapshotCache = (
  snapshots: Iterable<[string, PlayerSubscriptionSnapshot]>
): PlayerSubscriptionSnapshotCacheSummary => {
  const entries: PlayerSubscriptionSnapshotCacheEntry[] = [];
  let totalNonTileJsonBytes = 0;
  let uniqueTilesJsonBytes = 0;
  const uniqueTileArrays = new Map<PlayerSubscriptionSnapshot["tiles"], number>();
  for (const [playerId, snapshot] of snapshots) {
    const measure = measurePlayerSubscriptionSnapshot(snapshot);
    totalNonTileJsonBytes += measure.snapshotJsonBytes - measure.tilesJsonBytes;
    if (!uniqueTileArrays.has(snapshot.tiles)) {
      uniqueTileArrays.set(snapshot.tiles, measure.tilesJsonBytes);
      uniqueTilesJsonBytes += measure.tilesJsonBytes;
    }
    entries.push({
      playerId,
      snapshotJsonBytes: measure.snapshotJsonBytes,
      tileCount: measure.tileCount
    });
  }
  entries.sort((left, right) => right.snapshotJsonBytes - left.snapshotJsonBytes || left.playerId.localeCompare(right.playerId));
  return {
    entryCount: entries.length,
    totalSnapshotJsonBytes: totalNonTileJsonBytes + uniqueTilesJsonBytes,
    totalNonTileJsonBytes,
    uniqueTilesJsonBytes,
    uniqueTileArrayCount: uniqueTileArrays.size,
    topEntries: entries.slice(0, 3)
  };
};
