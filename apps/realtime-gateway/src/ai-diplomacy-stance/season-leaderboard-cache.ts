// The season leaderboard AI diplomacy sizes alliance blocs with (live AI
// snapshots carry no world status). One fetch serves every evaluation for a
// while; the wait is bounded, so a stalled simulation can't hang truce or
// alliance answers; and a failure is never cached, so one bad fetch doesn't
// make every AI "unable to weigh up an alliance" for the whole window.
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

import type { SeasonSizes } from "./ai-alliance-bloc.js";

export const SEASON_LEADERBOARD_TTL_MS = 30_000;
export const SEASON_LEADERBOARD_TIMEOUT_MS = 2_000;

/** The parts of the simulation's season summary the bloc check reads. */
export const seasonSizesFromSummary = (summary: Pick<CurrentSeasonSummary, "overall" | "landTileCount" | "dominanceTilesByPlayerId">): SeasonSizes => ({
  tiles: summary.overall,
  ...(summary.landTileCount !== undefined ? { landTileCount: summary.landTileCount } : {}),
  ...(summary.dominanceTilesByPlayerId ? { dominanceTilesByPlayerId: summary.dominanceTilesByPlayerId } : {})
});

export type SeasonLeaderboardCache = () => Promise<SeasonSizes | undefined>;

/** Resolves to the latest leaderboard, a stale one when a refresh fails or is slow, or undefined when there is none. */
export const createSeasonLeaderboardCache = (deps: {
  fetch: () => Promise<SeasonSizes>;
  now: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}): SeasonLeaderboardCache => {
  const ttlMs = deps.ttlMs ?? SEASON_LEADERBOARD_TTL_MS;
  const timeoutMs = deps.timeoutMs ?? SEASON_LEADERBOARD_TIMEOUT_MS;
  let cached: { sizes: SeasonSizes; expiresAt: number } | undefined;
  let inFlight: Promise<SeasonSizes | undefined> | undefined;
  return () => {
    if (cached && cached.expiresAt > deps.now()) return Promise.resolve(cached.sizes);
    inFlight ??= (async () => {
      // A fetch that lands after the timeout still refreshes the cache for the next caller.
      const fetched = deps.fetch().then((sizes) => {
        cached = { sizes, expiresAt: deps.now() + ttlMs };
        return sizes;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      });
      try {
        return (await Promise.race([fetched, timedOut])) ?? cached?.sizes;
      } catch {
        return cached?.sizes;
      } finally {
        clearTimeout(timer);
        fetched.catch(() => undefined);
        inFlight = undefined;
      }
    })();
    return inFlight;
  };
};
