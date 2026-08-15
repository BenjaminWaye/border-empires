// Persists whether the player has ever encountered a rival empire's
// territory. Mustering stays hidden from a brand-new player's tile menu
// until this flips true (see client-muster-tile-actions.ts) — new players
// have no adjacent enemy to muster against anyway, and the option only adds
// confusing, disabled-feeling clutter before then.
//
// Unlike the 30-day discovery-tip dismissals, this has no TTL: once you've
// met a rival empire, mustering stays unlocked for good. Scoped per-account
// (matching client-discovery-tips-storage.ts's pattern) so one account's
// progress doesn't unlock it for a different account on the same device.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";

const MUSTER_UNLOCK_STORAGE_KEY = "be-muster-unlocked";

const scopedKey = (authEmail?: string | null): string => `${MUSTER_UNLOCK_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

export const isMusterUnlocked = (authEmail?: string | null): boolean => {
  try {
    return window.localStorage.getItem(scopedKey(authEmail)) === "1";
  } catch {
    return false;
  }
};

export const markMusterUnlocked = (authEmail?: string | null): void => {
  try {
    window.localStorage.setItem(scopedKey(authEmail), "1");
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
