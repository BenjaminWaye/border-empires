// Tiny time-based-only TTL cache for GET /api/activity. This is a public,
// pollable endpoint (leaderboards/dashboards tend to get scraped on a tight
// loop), so a short cache keeps repeated hits from re-running the RPC round
// trip + aggregation work on every request. Deliberately just one cached
// value (not a per-key Map) -- the response has no per-caller variation.
export type ActivityApiCache<T> = {
  get: () => T | undefined;
  set: (value: T) => void;
};

export const createActivityApiCache = <T>(options: { ttlMs: number; now?: () => number }): ActivityApiCache<T> => {
  const now = options.now ?? (() => Date.now());
  let cached: { value: T; expiresAt: number } | undefined;
  return {
    get: () => (cached && cached.expiresAt > now() ? cached.value : undefined),
    set: (value: T) => {
      cached = { value, expiresAt: now() + options.ttlMs };
    }
  };
};
