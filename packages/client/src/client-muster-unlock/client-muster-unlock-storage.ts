// Persists whether the player has, THIS SEASON, ever encountered a rival
// empire's or barbarians' territory. Mustering stays hidden from a player's
// tile menu until this flips true (see client-muster-tile-actions.ts) --
// new players (or a fresh season for an existing player) have no adjacent
// enemy to muster against anyway, and the option only adds confusing,
// disabled-feeling clutter before then.
//
// Scoped per-season, not just per-account: each season is a brand-new map
// with no enemies met yet, so an unlock earned in an earlier season doesn't
// carry over -- see isMusterUnlocked()'s seasonId comparison.
// localStorage is the instant synchronous read (scoped per-account, matching
// client-discovery-tips-storage.ts's pattern); the authoritative copy lives
// on the gateway's player-profile row (`musterUnlockedSeasonId`, synced
// through client-hint-server-sync.ts) so it survives a browser data clear
// and follows the account across devices.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

const MUSTER_UNLOCK_STORAGE_KEY = "be-muster-unlocked";

const scopedKey = (authEmail?: string | null): string => `${MUSTER_UNLOCK_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

// The stored value IS the season id it was unlocked in (not a "1" flag) --
// mustering only reads as unlocked when that matches the season passed in.
export const isMusterUnlocked = (authEmail: string | null | undefined, seasonId: string | undefined): boolean => {
  if (!seasonId) return false;
  try {
    return window.localStorage.getItem(scopedKey(authEmail)) === seasonId;
  } catch {
    return false;
  }
};

export const markMusterUnlocked = (authEmail: string | null | undefined, seasonId: string): void => {
  if (!seasonId) return;
  try {
    window.localStorage.setItem(scopedKey(authEmail), seasonId);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  sendHintStateUpdate({ musterUnlockedSeasonId: seasonId });
};

/** Reconciles the server-persisted unlock (from INIT / HINT_STATE_SET) into
 * local storage, so a fresh browser/device doesn't re-lock mustering for an
 * account that already met an enemy this season. Only applies when the
 * server's stored season matches the current one -- an unlock recorded in a
 * past season must NOT carry into a new one, so a stale server value is
 * simply ignored rather than written. */
export const hydrateMusterUnlockFromServer = (
  storedSeasonId: string,
  currentSeasonId: string | undefined,
  authEmail?: string | null
): void => {
  if (!storedSeasonId || !currentSeasonId || storedSeasonId !== currentSeasonId) return;
  try {
    window.localStorage.setItem(scopedKey(authEmail), currentSeasonId);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
