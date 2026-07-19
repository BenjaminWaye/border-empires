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
    lastRefreshAtByTileKey.set(tileKey, now);
    deps.requestTileDetailIfNeeded(tile, { force: true });
  };
};
