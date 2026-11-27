// "Is there a viable landing site for a new House right now?" -- the Sector
// board shows a sector as full when there is not (GDD §6; owner decision
// 2026-11-27). The answer comes from the same search JoinSeason uses
// (ensurePlayerHasSpawnTerritory's probeOnly, which changes nothing), but that
// search can walk tens of thousands of candidates on a full map, so the
// answer is cached for LANDING_SITE_PROBE_TTL_MS.
//
// One cache slot per runtime, in a WeakMap: a season rollover swaps the
// runtime, which starts a fresh slot, and the old one goes with the old
// runtime. Nothing here grows with load or game time.

export const LANDING_SITE_PROBE_TTL_MS = 60_000;
/** A player id no real account has; the search uses it only to seed its order. */
export const LANDING_SITE_PROBE_PLAYER_ID = "__landing-site-probe__";

export type LandingSiteProbeRuntime = {
  ensurePlayerHasSpawnTerritory: (
    playerId: string,
    rallyAnchor: undefined,
    onRallySpawnPlaced: undefined,
    options: { probeOnly: true }
  ) => boolean;
};

const cacheByRuntime = new WeakMap<object, { at: number; available: boolean }>();

export const landingSiteAvailable = (runtime: LandingSiteProbeRuntime, now: number = Date.now()): boolean => {
  const cached = cacheByRuntime.get(runtime);
  if (cached && now - cached.at < LANDING_SITE_PROBE_TTL_MS) return cached.available;
  const available = runtime.ensurePlayerHasSpawnTerritory(LANDING_SITE_PROBE_PLAYER_ID, undefined, undefined, { probeOnly: true });
  cacheByRuntime.set(runtime, { at: now, available });
  return available;
};
