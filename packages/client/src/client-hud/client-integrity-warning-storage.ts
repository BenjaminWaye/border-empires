// Persists the "Empire Integrity" warning dismissal so it doesn't nag the
// player on every login while integrity stays below 90%. The dismissal
// decays after 30 days (approximately a season), at which point the tooltip
// is eligible to show again even if integrity never recovered above the
// threshold.
//
// The storage key is scoped per-account (matching the pattern used by
// `client-map-reveal.ts`). Without this scoping, a flat global key meant a
// dismissal from one account would silently suppress the warning for any
// other account signed into the same browser/device, which read as "the
// dismissal doesn't persist" or "persists for the wrong person" depending on
// which account dismissed it last.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";

const INTEGRITY_WARNING_STORAGE_KEY = "be-integrity-warning-dismissed-at";
const INTEGRITY_WARNING_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const integrityWarningStorageKey = (authEmail?: string | null): string =>
  `${INTEGRITY_WARNING_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

export const isIntegrityWarningDismissed = (authEmail?: string | null): boolean => {
  try {
    const raw = window.localStorage.getItem(integrityWarningStorageKey(authEmail));
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < INTEGRITY_WARNING_DISMISS_TTL_MS;
  } catch {
    return false;
  }
};

export const setIntegrityWarningDismissed = (authEmail?: string | null): void => {
  try {
    window.localStorage.setItem(integrityWarningStorageKey(authEmail), String(Date.now()));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const clearIntegrityWarningDismissed = (authEmail?: string | null): void => {
  try {
    window.localStorage.removeItem(integrityWarningStorageKey(authEmail));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

// Wires every "[data-dismiss-integrity-warning]" button in `root` to dismiss
// the warning both in-memory (via `onDismiss`) and persisted to storage.
export const wireIntegrityWarningDismissButtons = (
  root: ParentNode,
  authEmail: string | null | undefined,
  onDismiss: () => void
): void => {
  const buttons = root.querySelectorAll("[data-dismiss-integrity-warning]") as NodeListOf<HTMLButtonElement>;
  buttons.forEach((btn) => {
    btn.onclick = () => {
      setIntegrityWarningDismissed(authEmail);
      onDismiss();
    };
  });
};

// Resets the persisted dismissal once integrity recovers to >=90%, so the
// warning reappears promptly the next time integrity drops below 90%.
export const resetIntegrityWarningIfRecovered = (
  defensibilityPct: number,
  authEmail?: string | null
): boolean => {
  if (defensibilityPct < 90) return false;
  clearIntegrityWarningDismissed(authEmail);
  return true;
};
