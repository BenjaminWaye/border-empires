// Persists the tutorial guide's progress: whether the guide is running
// ("active"), finished ("done") or skipped ("dismissed"), the completed step
// ids, and the season that progress belongs to. localStorage gives instant
// synchronous reads (scoped per account, like
// client-onboarding-checklist-storage.ts); every change is mirrored to the
// gateway's player profile (SET_HINT_STATE guideStatus/guideSteps/
// guideSeasonId) so progress survives a browser data clear and follows the
// player to another device.
//
// Every player gets the guide at the start of every season (owner decision
// after the 2026-11 playtest): progress is per season, not per account. On
// INIT, progress from another season is replaced by a fresh "active" guide,
// and Skip guide on the card ends it for the rest of that season. Progress
// saved before it carried a season (the first guide release) is adopted as
// the current season's, so a player who already finished or skipped the
// guide this season isn't sent through it again on deploy.

import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { sendHintStateUpdate } from "../client-discovery-tips/client-hint-server-sync.js";

export type GuideStatus = "active" | "done" | "dismissed";
/** `seasonId` is "" for progress saved before the guide was per season, or before the season is known. */
export type GuideProgress = { status: GuideStatus | ""; steps: string[]; seasonId: string };

const GUIDE_STORAGE_KEY = "be-tutorial-guide";
// Matches the gateway's bound (handle-set-hint-state-message.ts).
const MAX_STORED_STEPS = 64;

const scopedKey = (authEmail?: string | null): string => `${GUIDE_STORAGE_KEY}:${debugAuthIdentityKeyForEmail(authEmail)}`;

const isGuideStatus = (value: unknown): value is GuideStatus => value === "active" || value === "done" || value === "dismissed";

const sanitizeSteps = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 48))].slice(0, MAX_STORED_STEPS) : [];

const sanitizeSeason = (value: unknown): string => (typeof value === "string" && value.length <= 128 ? value : "");

const EMPTY: GuideProgress = { status: "", steps: [], seasonId: "" };

// Read every frame by the guide tick, so localStorage is read once per account
// and mirrored here; every write goes through writeLocal, which updates both.
// One entry per account signed in on this page: bounded by sign-ins.
const memory = new Map<string, GuideProgress>();

const readStored = (key: string): GuideProgress => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as { status?: unknown; steps?: unknown; seasonId?: unknown };
    return { status: isGuideStatus(parsed.status) ? parsed.status : "", steps: sanitizeSteps(parsed.steps), seasonId: sanitizeSeason(parsed.seasonId) };
  } catch {
    return { ...EMPTY };
  }
};

export const readGuideProgress = (authEmail?: string | null): GuideProgress => {
  const key = scopedKey(authEmail);
  let progress = memory.get(key);
  if (!progress) {
    progress = readStored(key);
    memory.set(key, progress);
  }
  return { status: progress.status, steps: [...progress.steps], seasonId: progress.seasonId };
};

/** Test-only: forgets the in-memory mirror so the next read goes to localStorage. */
export const resetGuideStorageMemoryForTests = (): void => {
  memory.clear();
};

const writeLocal = (progress: GuideProgress, authEmail?: string | null): void => {
  memory.set(scopedKey(authEmail), { status: progress.status, steps: [...progress.steps], seasonId: progress.seasonId });
  try {
    window.localStorage.setItem(scopedKey(authEmail), JSON.stringify(progress));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
};

const sendProgress = (progress: GuideProgress): void => {
  if (!progress.status) return;
  sendHintStateUpdate({ guideStatus: progress.status, guideSteps: progress.steps, ...(progress.seasonId ? { guideSeasonId: progress.seasonId } : {}) });
};

const persist = (progress: GuideProgress, authEmail?: string | null): void => {
  writeLocal(progress, authEmail);
  sendProgress(progress);
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

/** "Restart guide" from settings: back to active with no completed steps, in the same season. */
export const restartGuide = (authEmail?: string | null): void => persist({ status: "active", steps: [], seasonId: readGuideProgress(authEmail).seasonId }, authEmail);

/**
 * Reconciles the server copy (the HINT_STATE_SET echo) into local storage.
 * The server status wins. Within the same status, completed steps are
 * unioned so a step finished on this device while the socket was down is not
 * lost (and is re-sent). An empty server status, or a server copy from a
 * different season than the local one, leaves local state alone.
 */
export const hydrateGuideFromServer = (status: unknown, steps: unknown, authEmail?: string | null, serverSeasonId: unknown = ""): void => {
  if (!isGuideStatus(status)) return;
  const local = readGuideProgress(authEmail);
  const seasonId = sanitizeSeason(serverSeasonId) || local.seasonId;
  if (local.seasonId && seasonId !== local.seasonId) return;
  const serverSteps = sanitizeSteps(steps);
  // Union only within the same status: a different server status means the
  // guide was finished, skipped or restarted elsewhere, so the server copy
  // replaces local progress (otherwise a stale device would undo a Restart).
  const merged = local.status === status ? sanitizeSteps([...serverSteps, ...local.steps]) : serverSteps;
  const next: GuideProgress = { status, steps: merged, seasonId };
  writeLocal(next, authEmail);
  if (merged.length !== serverSteps.length) sendProgress(next);
};

/**
 * INIT-time hydration. `seasonId` is the season the player is connecting to
 * ("" when the gateway reports none). Server progress for this season wins
 * (unioned with local steps); progress for another season starts the guide
 * over for this one. With no season known the old per-account behaviour
 * applies: keep whatever is stored, and enroll only a brand-new account
 * (`profileNeedsSetup`; the caller passes true for guests).
 */
export const hydrateTutorialGuideFromInit = (
  player: { guideStatus?: unknown; guideSteps?: unknown; guideSeasonId?: unknown; profileNeedsSetup?: unknown; onboardingChecklistCompleted?: unknown },
  authEmail?: string | null,
  seasonId = ""
): void => {
  const local = readGuideProgress(authEmail);
  const serverSeason = sanitizeSeason(player.guideSeasonId);
  if (isGuideStatus(player.guideStatus)) {
    // Unstamped server progress belongs to whatever season is current (first guide release).
    if (!seasonId || (serverSeason || seasonId) === seasonId) {
      if (local.seasonId && seasonId && local.seasonId !== seasonId) writeLocal({ ...EMPTY }, authEmail);
      hydrateGuideFromServer(player.guideStatus, player.guideSteps, authEmail, seasonId || serverSeason);
      // Stamp unstamped server progress with this season (once per INIT, never from the echo: no resend loop).
      if (seasonId && serverSeason !== seasonId) sendProgress(readGuideProgress(authEmail));
      return;
    }
  } else if (local.status && (!seasonId || (local.seasonId || seasonId) === seasonId)) {
    // Started on this device but the server never got it (socket dropped): stamp and resend.
    persist({ ...local, seasonId: seasonId || local.seasonId }, authEmail);
    return;
  }
  if (seasonId) {
    persist({ status: "active", steps: [], seasonId }, authEmail);
    return;
  }
  if (!local.status && player.profileNeedsSetup === true && player.onboardingChecklistCompleted !== true) persist({ status: "active", steps: [], seasonId: "" }, authEmail);
};
