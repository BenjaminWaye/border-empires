import { DEADLIEST_TILE_PERSIST_LIMIT } from "./deadliest-tile-limits.js";
/** Season-scoped attribution kept beside, never inside, the world snapshot.
 * Weak keys give this exactly the lifetime of the runtime's existing totals.
 * Persistence only saves attribution for the existing bounded top-K tiles. */
export interface TilePlayerLoss {
  playerId: string;
  manpowerLost: number;
}
export const MAX_SEASON_TILE_PLAYER_ENTRIES = 100_000;
export const MAX_PLAYERS_PER_COMBAT_TILE = 256;
interface Attribution {
  tiles: Map<string, Map<string, number>>;
  playerEntries: number;
  capHits: number;
  historyTruncated: boolean;
  completeHistoryTiles: Set<string>;
}
const byTotals = new WeakMap<ReadonlyMap<string, number>, Attribution>();
const trackerFor = (totals: ReadonlyMap<string, number>): Attribution => {
  let tracker = byTotals.get(totals);
  if (!tracker) {
    tracker = { tiles: new Map(), playerEntries: 0, capHits: 0, historyTruncated: false, completeHistoryTiles: new Set() };
    byTotals.set(totals, tracker);
  }
  return tracker;
};

const addPlayerLoss = (totals: ReadonlyMap<string, number>, tileKey: string, playerId: string, loss: number): void => {
  if (!Number.isFinite(loss) || loss <= 0 || !playerId) return;
  const tracker = trackerFor(totals);
  let players = tracker.tiles.get(tileKey);
  if (!players?.has(playerId)) {
    // Every tile has at least one player entry; the global entry bound also
    // bounds tiles. Check both structures explicitly before allocating.
    if (tracker.playerEntries >= MAX_SEASON_TILE_PLAYER_ENTRIES ||
        (!players && tracker.tiles.size >= MAX_SEASON_TILE_PLAYER_ENTRIES) ||
        (players && players.size >= MAX_PLAYERS_PER_COMBAT_TILE)) {
      tracker.capHits += 1;
      return;
    }
    if (!players) { players = new Map(); tracker.tiles.set(tileKey, players); }
    tracker.playerEntries += 1;
  }
  players!.set(playerId, (players!.get(playerId) ?? 0) + loss);
};

export const recordSeasonTileLoss = (totals: Map<string, number>, tileKey: string, playerId: string, loss: number): void => {
  if (!Number.isFinite(loss) || loss <= 0) return;
  totals.set(tileKey, (totals.get(tileKey) ?? 0) + loss);
  addPlayerLoss(totals, tileKey, playerId, loss);
};

export const tilePlayerLosses = (totals: ReadonlyMap<string, number>, tileKey: string): TilePlayerLoss[] =>
  [...(byTotals.get(totals)?.tiles.get(tileKey) ?? [])]
    .map(([playerId, manpowerLost]) => ({ playerId, manpowerLost }));

/** A repeated restore cannot duplicate counts or walk a live value backwards. */
export const restoreTilePlayerLosses = (totals: ReadonlyMap<string, number>, tileKey: string, losses: readonly TilePlayerLoss[]): void => {
  for (const loss of losses) {
    const current = byTotals.get(totals)?.tiles.get(tileKey)?.get(loss.playerId) ?? 0;
    addPlayerLoss(totals, tileKey, loss.playerId, loss.manpowerLost - current);
  }
};

/** A dropped tile's restarted aggregate cannot prove a complete season. */
export const hasCompleteSeasonTileHistory = (totals: ReadonlyMap<string, number>, key: string): boolean => {
  const tracker = byTotals.get(totals);
  return !tracker?.historyTruncated || tracker.completeHistoryTiles.has(key);
};

export const seasonTileHistoryWasTruncated = (totals: ReadonlyMap<string, number>): boolean =>
  byTotals.get(totals)?.historyTruncated ?? false;

export const restoreSeasonTileHistory = (
  totals: ReadonlyMap<string, number>,
  entries: readonly { key: string; historyComplete?: boolean }[],
  truncated: boolean
): void => {
  const tracker = trackerFor(totals);
  tracker.historyTruncated ||= truncated;
  if (!tracker.historyTruncated) return;
  for (const entry of entries) {
    if (entry.historyComplete === false) { tracker.completeHistoryTiles.delete(entry.key); continue; }
    if (tracker.completeHistoryTiles.has(entry.key)) continue;
    if (tracker.completeHistoryTiles.size >= DEADLIEST_TILE_PERSIST_LIMIT) { tracker.capHits += 1; continue; }
    tracker.completeHistoryTiles.add(entry.key);
  }
};

export const seasonTilePlayerLossGauge = (totals: ReadonlyMap<string, number>): {
  tileEntries: number; playerEntries: number; capHits: number; completeHistoryTiles: number; historyTruncated: boolean;
} => {
  const tracker = byTotals.get(totals);
  return { tileEntries: tracker?.tiles.size ?? 0, playerEntries: tracker?.playerEntries ?? 0, capHits: tracker?.capHits ?? 0,
    completeHistoryTiles: tracker?.completeHistoryTiles.size ?? 0, historyTruncated: tracker?.historyTruncated ?? false };
};
