// Persists whether the new-player onboarding checklist (settle your first
// town, then claim 4 food slots) has been completed, so it doesn't
// reappear once a player has finished it. Unlike discovery tips this has no
// TTL — once done, done for good — mirroring `client-map-reveal.ts`'s
// per-account scoping so a completion on one account doesn't hide the
// checklist for a different account signed into the same browser/device.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

const ONBOARDING_CHECKLIST_STORAGE_KEY = "be-onboarding-checklist-completed";

const scopedKey = (authEmail?: string | null): string => `${ONBOARDING_CHECKLIST_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

export const isOnboardingChecklistCompleted = (authEmail?: string | null): boolean => {
  try {
    return window.localStorage.getItem(scopedKey(authEmail)) === "1";
  } catch {
    return false;
  }
};

export const markOnboardingChecklistCompleted = (authEmail?: string | null): void => {
  try {
    window.localStorage.setItem(scopedKey(authEmail), "1");
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
  sendHintStateUpdate({ onboardingChecklistCompleted: true });
};

/** Reconciles server-persisted checklist completion (from the INIT message)
 * into local storage, so a fresh browser/device doesn't re-show a checklist
 * this account already finished. */
export const hydrateOnboardingChecklistFromServer = (completed: boolean, authEmail?: string | null): void => {
  if (!completed) return;
  try {
    window.localStorage.setItem(scopedKey(authEmail), "1");
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

export const clearOnboardingChecklistCompleted = (authEmail?: string | null): void => {
  try {
    window.localStorage.removeItem(scopedKey(authEmail));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};
