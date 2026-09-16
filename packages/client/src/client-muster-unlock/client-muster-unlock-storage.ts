// Persists whether the player has ever encountered a rival empire's or
// barbarians' territory. Mustering stays hidden from a brand-new player's
// tile menu until this flips true (see client-muster-tile-actions.ts) — new
// players have no adjacent enemy to muster against anyway, and the option
// only adds confusing, disabled-feeling clutter before then.
//
// Unlike the 30-day discovery-tip dismissals, this has no TTL: once you've
// met an enemy, mustering stays unlocked for good. localStorage is the
// instant synchronous read (scoped per-account, matching
// client-discovery-tips-storage.ts's pattern); the authoritative copy lives
// on the gateway's player-profile row (`musterUnlocked`, synced through
// client-hint-server-sync.ts) so it survives a browser data clear and
// follows the account across devices.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

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
  sendHintStateUpdate({ musterUnlocked: true });
};

/** Reconciles the server-persisted unlock (from INIT / HINT_STATE_SET) into
 * local storage, so a fresh browser/device doesn't re-lock mustering for an
 * account that already met an enemy. Server `false` never clears a local
 * unlock: the flag only flips one way, and a local unlock that hasn't
 * reached the server yet resyncs on the next markMusterUnlocked call. */
export const hydrateMusterUnlockFromServer = (unlocked: boolean, authEmail?: string | null): void => {
  if (!unlocked) return;
  try {
    window.localStorage.setItem(scopedKey(authEmail), "1");
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
