import { debugAuthIdentityKeyForEmail } from "./client-debug.js";

const MAP_REVEAL_STORAGE_KEY = "be-map-reveal";

const mapRevealStorageKey = (identityKey: string): string => `${MAP_REVEAL_STORAGE_KEY}:${identityKey}`;

type MapRevealOptions = {
  enabledForAccount?: boolean;
  authEmail?: string | null;
};

const resolveIdentityKey = (authEmail?: string | null): string => debugAuthIdentityKeyForEmail(authEmail);

// The per-account gate is the server-side `canToggleFog` (keyed to
// `FOG_ADMIN_EMAIL`), surfaced here as `enabledForAccount`. The hostname check
// used to be a second line of defense, but that blocked the fog admin from
// inspecting prod-only AI state. The server gate alone is sufficient because
// `FOG_ADMIN_EMAIL` already scopes the capability to a single account.
export const mapRevealAvailable = (options?: MapRevealOptions): boolean =>
  Boolean(options?.enabledForAccount);

export const getMapRevealEnabled = (options?: MapRevealOptions): boolean => {
  if (!mapRevealAvailable(options)) return false;
  try {
    return window.localStorage.getItem(mapRevealStorageKey(resolveIdentityKey(options?.authEmail))) === "1";
  } catch {
    return false;
  }
};

export const setMapRevealEnabled = (enabled: boolean, options?: MapRevealOptions): void => {
  if (!mapRevealAvailable(options)) return;
  try {
    const storageKey = mapRevealStorageKey(resolveIdentityKey(options?.authEmail));
    if (enabled) window.localStorage.setItem(storageKey, "1");
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

// Force-clear the persisted reveal preference regardless of eligibility. Called
// on every Firebase sign-in so the fog admin must re-toggle reveal each login —
// stale reveal state on connect makes the gateway fan out a full-world snapshot
// for every TILE_DELTA_BATCH and starved login bootstrap in prod on 2026-05-23.
export const clearStoredMapReveal = (authEmail?: string | null): void => {
  try {
    window.localStorage.removeItem(mapRevealStorageKey(resolveIdentityKey(authEmail)));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const effectiveFogDisabled = (state: { fogDisabled: boolean }): boolean => state.fogDisabled;
