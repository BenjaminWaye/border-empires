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
  topEntries: PlayerSubscriptionSnapshotCacheEntry[];
};

const utf8Encoder = new TextEncoder();

export const jsonByteSize = (value: unknown): number => utf8Encoder.encode(JSON.stringify(value)).length;

export const measurePlayerSubscriptionSnapshot = (
  snapshot: PlayerSubscriptionSnapshot
): PlayerSubscriptionSnapshotMeasure => ({
  tileCount: snapshot.tiles.length,
  docksCount: snapshot.docks?.length ?? 0,
  snapshotJsonBytes: jsonByteSize(snapshot),
  tilesJsonBytes: jsonByteSize(snapshot.tiles),
  playerJsonBytes: snapshot.player ? jsonByteSize(snapshot.player) : 0,
  worldStatusJsonBytes: snapshot.worldStatus ? jsonByteSize(snapshot.worldStatus) : 0,
  seasonJsonBytes: snapshot.season ? jsonByteSize(snapshot.season) : 0,
  docksJsonBytes: snapshot.docks?.length ? jsonByteSize(snapshot.docks) : 0
});

export const summarizePlayerSubscriptionSnapshotCache = (
  snapshots: Iterable<[string, PlayerSubscriptionSnapshot]>
): PlayerSubscriptionSnapshotCacheSummary => {
  const entries: PlayerSubscriptionSnapshotCacheEntry[] = [];
  let totalSnapshotJsonBytes = 0;
  for (const [playerId, snapshot] of snapshots) {
    const measure = measurePlayerSubscriptionSnapshot(snapshot);
    totalSnapshotJsonBytes += measure.snapshotJsonBytes;
    entries.push({
      playerId,
      snapshotJsonBytes: measure.snapshotJsonBytes,
      tileCount: measure.tileCount
    });
  }
  entries.sort((left, right) => right.snapshotJsonBytes - left.snapshotJsonBytes || left.playerId.localeCompare(right.playerId));
  return {
    entryCount: entries.length,
    totalSnapshotJsonBytes,
    topEntries: entries.slice(0, 3)
  };
};
