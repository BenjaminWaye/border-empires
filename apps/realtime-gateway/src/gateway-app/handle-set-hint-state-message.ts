// Persists a player's in-game hint/tutorial state (per-tip dismissals, the
// global "show hints" mute, onboarding-checklist completion, and the
// per-season muster unlock, and the season whose first login already got the quiet dashboard pass) on the gateway's player-profile row instead of
// client-side localStorage, so it survives a browser data clear and follows
// the player across devices.
import type { GuideStatus } from "../player-profile-store/player-profile-store.js";

const GUIDE_STATUSES: readonly string[] = ["active", "done", "dismissed"];
// Bounds for the guide's completed-step list (ids are short client constants;
// the client never sends more than its own step count).
const MAX_GUIDE_STEPS = 64;
const MAX_GUIDE_STEP_ID_LENGTH = 48;

const isGuideStatus = (value: unknown): value is GuideStatus => typeof value === "string" && GUIDE_STATUSES.includes(value);
const isGuideSteps = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_GUIDE_STEPS && value.every((id) => typeof id === "string" && id.length <= MAX_GUIDE_STEP_ID_LENGTH);

export type StoredHintState = {
  dismissedHints?: string[];
  hintsMuted?: boolean;
  onboardingChecklistCompleted?: boolean;
  musterUnlockedSeasonId?: string;
  dashboardQuietedSeasonId?: string;
  guideStatus?: GuideStatus;
  guideSteps?: string[];
};

export type SetHintStateMessageDeps = {
  playerId: string;
  dismissedHints: unknown;
  hintsMuted: unknown;
  onboardingChecklistCompleted: unknown;
  musterUnlockedSeasonId: unknown;
  dashboardQuietedSeasonId?: unknown;
  guideStatus?: unknown;
  guideSteps?: unknown;
  profileStore: {
    setHintState: (playerId: string, patch: StoredHintState) => Promise<StoredHintState>;
  };
  invalidateProfileCache: (playerId: string) => void;
  sendJson: (payload: unknown) => void;
};

/** Hint-state fields injected onto the INIT message's `player` (gateway-app.ts) and echoed on HINT_STATE_SET, with the per-field defaults a fresh profile gets. */
export const hintStateInitFields = (
  profile: StoredHintState | undefined
): Required<Omit<StoredHintState, "guideStatus">> & { guideStatus: GuideStatus | "" } => ({
  dismissedHints: profile?.dismissedHints ?? [],
  hintsMuted: profile?.hintsMuted ?? false,
  onboardingChecklistCompleted: profile?.onboardingChecklistCompleted ?? false,
  musterUnlockedSeasonId: profile?.musterUnlockedSeasonId ?? "",
  dashboardQuietedSeasonId: profile?.dashboardQuietedSeasonId ?? "",
  guideStatus: profile?.guideStatus ?? "",
  guideSteps: profile?.guideSteps ?? []
});

export const handleSetHintStateMessage = async (deps: SetHintStateMessageDeps): Promise<void> => {
  const { playerId, dismissedHints, hintsMuted, onboardingChecklistCompleted, musterUnlockedSeasonId, dashboardQuietedSeasonId, guideStatus, guideSteps, profileStore, invalidateProfileCache, sendJson } = deps;
  const patch = {
    ...(Array.isArray(dismissedHints) && dismissedHints.every((id) => typeof id === "string")
      ? { dismissedHints: dismissedHints as string[] }
      : {}),
    ...(typeof hintsMuted === "boolean" ? { hintsMuted } : {}),
    ...(typeof onboardingChecklistCompleted === "boolean" ? { onboardingChecklistCompleted } : {}),
    ...(typeof musterUnlockedSeasonId === "string" && musterUnlockedSeasonId ? { musterUnlockedSeasonId } : {}),
    ...(typeof dashboardQuietedSeasonId === "string" && dashboardQuietedSeasonId ? { dashboardQuietedSeasonId } : {}),
    ...(isGuideStatus(guideStatus) ? { guideStatus } : {}),
    ...(isGuideSteps(guideSteps) ? { guideSteps } : {})
  };
  const updated = await profileStore.setHintState(playerId, patch);
  invalidateProfileCache(playerId);
  sendJson({ type: "HINT_STATE_SET", ...hintStateInitFields(updated) });
};
