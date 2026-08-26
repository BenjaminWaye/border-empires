// Runs once per connect (see per-connect-hellos.ts), never on a hot per-tick
// path: forces a fresh supply/demand/dormancy recompute straight from live
// tile state, bypassing every resource-slot cache, to self-heal one that went
// stale for a connecting player with no tile change of their own to
// invalidate it. A live recompute is correct by construction (it reads
// current tile state directly, nothing cached), so this is a one-shot fix
// with zero cost on any hot path (combat, garrison/muster ticks, ability/
// build gating) that reads these caches every tick instead.
export type ResourceSlotCacheRefreshContext = {
  hasPlayer: (playerId: string) => boolean;
  refreshSupplyFresh: (playerId: string) => void;
  refreshDemandFresh: (playerId: string) => void;
  clearDormancyCache: (playerId: string) => void;
  readDormancy: (playerId: string) => void;
};

export const refreshResourceSlotCachesForPlayer = (ctx: ResourceSlotCacheRefreshContext, playerId: string): void => {
  if (!ctx.hasPlayer(playerId)) return;
  ctx.refreshSupplyFresh(playerId); ctx.refreshDemandFresh(playerId);
  ctx.clearDormancyCache(playerId); ctx.readDormancy(playerId);
};
