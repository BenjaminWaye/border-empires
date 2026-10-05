import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { storageGet, storageSet } from "../client-state/client-state.js";

// A season rollover resets the map and stacks the lobby/join flow, spawn and
// first-empire popups on the player's first login. What's New stays out of
// that pile: it isn't auto-opened on the first login of a season (the
// Updates tab and its unread badge still carry the notes), and shows up on a
// later login instead.
const STORAGE_KEY = "be-whats-new-last-login-season";

const scopedKey = (authEmail: string | null | undefined): string => `${STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

/**
 * True exactly once per (account, season): the first time this browser logs
 * in to `seasonId`. Records the season as it answers, so call it once per
 * login. An unknown season id answers false (never suppresses on missing data).
 *
 * Per-browser, so a returning player on a fresh browser/device also gets one
 * quiet login; that is the cheap side of the tradeoff versus a server-side flag.
 */
export const isFirstLoginOfSeason = (
  seasonId: string | undefined,
  authEmail: string | null | undefined,
  storage: { get: (key: string) => string | null; set: (key: string, value: string) => void } = { get: storageGet, set: storageSet }
): boolean => {
  if (!seasonId) return false;
  const key = scopedKey(authEmail);
  if (storage.get(key) === seasonId) return false;
  storage.set(key, seasonId);
  return true;
};
