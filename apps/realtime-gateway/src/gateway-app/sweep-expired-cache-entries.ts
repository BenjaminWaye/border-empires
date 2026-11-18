// Drops expired rows from the gateway's TTL caches (auth bindings, profiles).
// Extracted from gateway-app.ts (over the 500-line cap).
export const sweepExpiredCacheEntries = (cache: Map<string, { expiresAt: number }>, nowMs: number): void => {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= nowMs) cache.delete(key);
  }
};
