import type { TileTimedProgress } from "../client-types.js";

// A server-originated settle (this player never clicked the tile locally --
// e.g. queued/auto-settle progress restored on reconnect, or advanced by
// another client session) only reaches the settle overlay via a
// rebuildVisibleTerrain pass, which is gated on tilesRevision changing
// (client-map-3d.ts's maybeRebuild). applyOptimisticTileState only bumps that
// revision when a tile's ownerId/ownershipState/optimisticPending field
// actually changes, but a tile already marked FRONTIER/optimisticPending
// "settle" from an earlier update has nothing left to change -- so the
// animation silently never appeared until an unrelated interaction (a click,
// a camera pan) happened to trigger a rebuild for its own reasons. Callers
// use this to force a tilesRevision bump exactly when the settle-progress set
// genuinely changed, instead of relying on tile-field mutation as a proxy.
export const settleProgressSetChanged = (
  previous: ReadonlyMap<string, TileTimedProgress>,
  next: ReadonlyMap<string, TileTimedProgress>
): boolean => {
  if (previous.size !== next.size) return true;
  for (const [tileKey, progress] of next) {
    const prior = previous.get(tileKey);
    if (!prior || prior.startAt !== progress.startAt || prior.resolvesAt !== progress.resolvesAt) return true;
  }
  return false;
};
