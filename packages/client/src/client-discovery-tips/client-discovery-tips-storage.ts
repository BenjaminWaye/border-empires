// Persists "first discovery" tip dismissals (first town, first resource of
// each kind) so a dismissed tip doesn't reappear on every login. Each tip id
// decays after 30 days (approximately a season), matching the Empire
// Integrity warning's TTL — mirroring `client-integrity-warning-storage.ts`.
//
// Also persists a single global "don't show tooltips" mute (set via the
// checkbox on the toast), which suppresses every discovery tip for the same
// 30-day/season window regardless of id.
//
// Both are scoped per-account (matching `client-map-reveal.ts`'s pattern), so
// a dismissal/mute on one account doesn't suppress tips for a different
// account signed into the same browser/device.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";

const DISCOVERY_TIPS_STORAGE_KEY = "be-discovery-tips-dismissed-at";
const DISCOVERY_TIPS_MUTE_STORAGE_KEY = "be-discovery-tips-muted-until";
const DISCOVERY_TIP_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const scopedKey = (baseKey: string, authEmail?: string | null): string =>
  `${baseKey}:${debugAuthIdentityKeyForEmail(authEmail)}`;

const readTimestamps = (authEmail?: string | null): Record<string, number> => {
  try {
    const raw = window.localStorage.getItem(scopedKey(DISCOVERY_TIPS_STORAGE_KEY, authEmail));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value)) result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
};

export const isDiscoveryTipSeen = (tipId: string, authEmail?: string | null): boolean => {
  try {
    const dismissedAt = readTimestamps(authEmail)[tipId];
    if (dismissedAt === undefined) return false;
    return Date.now() - dismissedAt < DISCOVERY_TIP_DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const markDiscoveryTipSeen = (tipId: string, authEmail?: string | null): void => {
  try {
    const timestamps = readTimestamps(authEmail);
    timestamps[tipId] = Date.now();
    window.localStorage.setItem(scopedKey(DISCOVERY_TIPS_STORAGE_KEY, authEmail), JSON.stringify(timestamps));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const clearDiscoveryTipsSeen = (authEmail?: string | null): void => {
  try {
    window.localStorage.removeItem(scopedKey(DISCOVERY_TIPS_STORAGE_KEY, authEmail));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const isDiscoveryTipsMuted = (authEmail?: string | null): boolean => {
  try {
    const raw = window.localStorage.getItem(scopedKey(DISCOVERY_TIPS_MUTE_STORAGE_KEY, authEmail));
    if (!raw) return false;
    const mutedAt = Number(raw);
    if (!Number.isFinite(mutedAt)) return false;
    return Date.now() - mutedAt < DISCOVERY_TIP_DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const muteDiscoveryTips = (authEmail?: string | null): void => {
  try {
    window.localStorage.setItem(scopedKey(DISCOVERY_TIPS_MUTE_STORAGE_KEY, authEmail), String(Date.now()));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const clearDiscoveryTipsMute = (authEmail?: string | null): void => {
  try {
    window.localStorage.removeItem(scopedKey(DISCOVERY_TIPS_MUTE_STORAGE_KEY, authEmail));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
