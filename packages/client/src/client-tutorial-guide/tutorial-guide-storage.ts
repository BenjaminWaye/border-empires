// Persists the new-account tutorial guide's progress: whether the guide is
// running ("active"), finished ("done") or dismissed, plus the completed step
// ids. localStorage gives instant synchronous reads (scoped per account, like
// client-onboarding-checklist-storage.ts); every change is mirrored to the
// gateway's player profile (SET_HINT_STATE guideStatus/guideSteps) so progress
// survives a browser data clear and follows the player to another device.
//
// Only new accounts are enrolled: the gateway reports `profileNeedsSetup` on
// the INIT of an account that has not finished profile setup yet, and an
// account with no stored guide status that is still in that state (and has
// not already completed the old onboarding checklist) is enrolled once. Every
// account created before the guide shipped has no stored status and an
// already-complete profile, so it keeps the plain checklist.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

export type GuideStatus = "active" | "done" | "dismissed";
export type GuideProgress = { status: GuideStatus | ""; steps: string[] };

const GUIDE_STORAGE_KEY = "be-tutorial-guide";
// Matches the gateway's bound (handle-set-hint-state-message.ts).
const MAX_STORED_STEPS = 64;

const scopedKey = (authEmail?: string | null): string => `${GUIDE_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

const isGuideStatus = (value: unknown): value is GuideStatus => value === "active" || value === "done" || value === "dismissed";

const sanitizeSteps = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 48))].slice(0, MAX_STORED_STEPS) : [];

// Read every frame by the guide tick, so localStorage is read once per account
// and mirrored here; every write goes through writeLocal, which updates both.
// One entry per account signed in on this page: bounded by sign-ins.
const memory = new Map<string, GuideProgress>();

const readStored = (key: string): GuideProgress => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { status: "", steps: [] };
    const parsed = JSON.parse(raw) as { status?: unknown; steps?: unknown };
    return { status: isGuideStatus(parsed.status) ? parsed.status : "", steps: sanitizeSteps(parsed.steps) };
  } catch {
    return { status: "", steps: [] };
  }
};

export const readGuideProgress = (authEmail?: string | null): GuideProgress => {
  const key = scopedKey(authEmail);
  let progress = memory.get(key);
  if (!progress) {
    progress = readStored(key);
    memory.set(key, progress);
  }
  return { status: progress.status, steps: [...progress.steps] };
};

/** Test-only: forgets the in-memory mirror so the next read goes to localStorage. */
export const resetGuideStorageMemoryForTests = (): void => {
  memory.clear();
};

const writeLocal = (progress: GuideProgress, authEmail?: string | null): void => {
  memory.set(scopedKey(authEmail), { status: progress.status, steps: [...progress.steps] });
  try {
    window.localStorage.setItem(scopedKey(authEmail), JSON.stringify(progress));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const persist = (progress: GuideProgress, authEmail?: string | null): void => {
  writeLocal(progress, authEmail);
  if (progress.status) sendHintStateUpdate({ guideStatus: progress.status, guideSteps: progress.steps });
};

export const isGuideActive = (authEmail?: string | null): boolean => readGuideProgress(authEmail).status === "active";

/** Adds newly completed step ids; returns true when anything changed (and was persisted). */
export const markGuideStepsCompleted = (stepIds: readonly string[], authEmail?: string | null): boolean => {
  const progress = readGuideProgress(authEmail);
  const fresh = stepIds.filter((id) => !progress.steps.includes(id));
  if (fresh.length === 0) return false;
  persist({ ...progress, steps: sanitizeSteps([...progress.steps, ...fresh]) }, authEmail);
  return true;
};

export const setGuideStatus = (status: GuideStatus, authEmail?: string | null): void => {
  const progress = readGuideProgress(authEmail);
  if (progress.status === status) return;
  persist({ ...progress, status }, authEmail);
};

/** "Restart guide" from settings: back to active with no completed steps. */
export const restartGuide = (authEmail?: string | null): void => persist({ status: "active", steps: [] }, authEmail);

/**
 * Reconciles the server copy (INIT or the HINT_STATE_SET echo) into local
 * storage. The server status wins; completed steps are unioned so a step
 * finished on this device while the socket was down is not lost (and is
 * re-sent). An empty server status leaves local state alone.
 */
export const hydrateGuideFromServer = (status: unknown, steps: unknown, authEmail?: string | null): void => {
  if (!isGuideStatus(status)) return;
  const local = readGuideProgress(authEmail);
  const serverSteps = sanitizeSteps(steps);
  const merged = sanitizeSteps([...serverSteps, ...local.steps]);
  writeLocal({ status, steps: merged }, authEmail);
  if (merged.length !== serverSteps.length) sendHintStateUpdate({ guideStatus: status, guideSteps: merged });
};

/**
 * INIT-time enrollment and hydration. `profileNeedsSetup` marks an account
 * that has not finished its first profile setup, i.e. a brand-new account.
 */
export const hydrateTutorialGuideFromInit = (
  player: { guideStatus?: unknown; guideSteps?: unknown; profileNeedsSetup?: unknown; onboardingChecklistCompleted?: unknown },
  authEmail?: string | null
): void => {
  if (isGuideStatus(player.guideStatus)) {
    hydrateGuideFromServer(player.guideStatus, player.guideSteps, authEmail);
    return;
  }
  const local = readGuideProgress(authEmail);
  if (local.status) {
    // Enrolled on this device but the server never got it (socket dropped): resend.
    sendHintStateUpdate({ guideStatus: local.status, guideSteps: local.steps });
    return;
  }
  if (player.profileNeedsSetup === true && player.onboardingChecklistCompleted !== true) persist({ status: "active", steps: [] }, authEmail);
};
