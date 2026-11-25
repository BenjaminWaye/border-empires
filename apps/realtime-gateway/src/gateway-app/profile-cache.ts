import type { GatewayPlayerProfileStore, StoredPlayerProfile } from "../player-profile-store/player-profile-store.js";
import { sweepExpiredCacheEntries } from "./sweep-expired-cache-entries.js";

// Short-lived read cache in front of the profile store. Lifted out of
// gateway-app.ts unchanged. Reads go through here because a synchronous
// node:sqlite read on the database shared with the simulation can block the
// event loop. Entries expire after `ttlMs` and `sweep` removes expired ones;
// callers must `invalidate` after every profile write.
export type ProfileCache = {
  get: (playerId: string) => Promise<StoredPlayerProfile | undefined>;
  invalidate: (playerId: string) => void;
  sweep: (nowMs: number) => void;
};

export const createProfileCache = (profileStore: Pick<GatewayPlayerProfileStore, "get">, ttlMs: number): ProfileCache => {
  const cache = new Map<string, { value: StoredPlayerProfile | undefined; expiresAt: number }>();
  return {
    async get(playerId) {
      if (ttlMs <= 0) return profileStore.get(playerId);
      const now = Date.now();
      const cached = cache.get(playerId);
      if (cached && cached.expiresAt > now) return cached.value ? { ...cached.value } : undefined;
      const fresh = await profileStore.get(playerId);
      cache.set(playerId, { value: fresh ? { ...fresh } : undefined, expiresAt: now + ttlMs });
      return fresh;
    },
    invalidate(playerId) {
      cache.delete(playerId);
    },
    sweep(nowMs) {
      sweepExpiredCacheEntries(cache, nowMs);
    }
  };
};
