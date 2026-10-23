// The season leaderboard AI diplomacy sizes alliance blocs with (live AI
// snapshots carry no world status). One fetch serves every evaluation for a
// while; the wait is bounded, so a stalled simulation can't hang truce or
// alliance answers; and a failure is never cached, so one bad fetch doesn't
// make every AI "unable to weigh up an alliance" for the whole window.
import type { LeaderboardTiles } from "./ai-alliance-bloc.js";

export const SEASON_LEADERBOARD_TTL_MS = 30_000;
export const SEASON_LEADERBOARD_TIMEOUT_MS = 2_000;

export type SeasonLeaderboardCache = () => Promise<LeaderboardTiles | undefined>;

/** Resolves to the latest leaderboard, a stale one when a refresh fails or is slow, or undefined when there is none. */
export const createSeasonLeaderboardCache = (deps: {
  fetch: () => Promise<LeaderboardTiles>;
  now: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}): SeasonLeaderboardCache => {
  const ttlMs = deps.ttlMs ?? SEASON_LEADERBOARD_TTL_MS;
  const timeoutMs = deps.timeoutMs ?? SEASON_LEADERBOARD_TIMEOUT_MS;
  let cached: { tiles: LeaderboardTiles; expiresAt: number } | undefined;
  let inFlight: Promise<LeaderboardTiles | undefined> | undefined;
  return () => {
    if (cached && cached.expiresAt > deps.now()) return Promise.resolve(cached.tiles);
    inFlight ??= (async () => {
      // A fetch that lands after the timeout still refreshes the cache for the next caller.
      const fetched = deps.fetch().then((tiles) => {
        cached = { tiles, expiresAt: deps.now() + ttlMs };
        return tiles;
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs);
      });
      try {
        return (await Promise.race([fetched, timedOut])) ?? cached?.tiles;
      } catch {
        return cached?.tiles;
      } finally {
        clearTimeout(timer);
        fetched.catch(() => undefined);
        inFlight = undefined;
      }
    })();
    return inFlight;
  };
};
