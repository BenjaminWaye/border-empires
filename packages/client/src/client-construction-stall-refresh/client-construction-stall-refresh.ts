import type { Tile } from "../client-types.js";

// Structure construction/removal completes via a one-shot server timer that
// flips fort/observatory/siegeOutpost/economicStructure status and pushes a
// TILE_DELTA. If that delta is dropped, delayed, or missed while
// disconnected, the client's cached tile keeps stale under_construction
// status with a completesAt already in the past, so the on-map countdown
// reads 0 forever with no client-side mechanism ever re-checking the real
// status. Once a tile's countdown hits 0 while still under construction,
// force a fresh REQUEST_TILE_DETAIL (throttled per tile) to reconcile
// against the server's authoritative state instead of trusting a stale
// local field indefinitely.
// lastRefreshAtByTileKey only ever gets an entry deleted when a tile is
// re-observed with time remaining again (a fresh build) -- once a stalled
// tile's forced refresh actually reconciles it, constructionRemainingMsForTile
// stops returning a value for that tile at all, so this function is never
// called for it again and the entry would otherwise sit here forever. Cap the
// map so a long play session panning across many stalled tiles can't leak
// unbounded memory; entries are cheap (one timestamp) and eviction only means
// a very stale, likely-already-fixed tile has to re-throttle from scratch.
const MAX_TRACKED_TILE_KEYS = 500;

export const createStalledConstructionRefresher = (deps: {
  requestTileDetailIfNeeded: (tile: Tile | undefined, options?: { force?: boolean }) => void;
  throttleMs?: number;
}) => {
  const lastRefreshAtByTileKey = new Map<string, number>();
  const throttleMs = deps.throttleMs ?? 10_000;
  return (tile: Tile, tileKey: string, remainingMs: number): void => {
    if (remainingMs > 0) {
      lastRefreshAtByTileKey.delete(tileKey);
      return;
    }
    const now = Date.now();
    const lastRefreshAt = lastRefreshAtByTileKey.get(tileKey) ?? 0;
    if (now - lastRefreshAt < throttleMs) return;
    if (!lastRefreshAtByTileKey.has(tileKey) && lastRefreshAtByTileKey.size >= MAX_TRACKED_TILE_KEYS) {
      const oldestKey = lastRefreshAtByTileKey.keys().next().value;
      if (oldestKey !== undefined) lastRefreshAtByTileKey.delete(oldestKey);
    }
    lastRefreshAtByTileKey.set(tileKey, now);
    deps.requestTileDetailIfNeeded(tile, { force: true });
  };
};
