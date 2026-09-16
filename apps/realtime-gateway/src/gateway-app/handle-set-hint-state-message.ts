// Persists a player's in-game hint/tutorial state (per-tip dismissals, the
// global "show hints" mute, onboarding-checklist completion, and the
// per-season muster unlock) on the gateway's player-profile row instead of
// client-side localStorage, so it survives a browser data clear and follows
// the player across devices.
export type StoredHintState = {
  dismissedHints?: string[];
  hintsMuted?: boolean;
  onboardingChecklistCompleted?: boolean;
  musterUnlockedSeasonId?: string;
};

export type SetHintStateMessageDeps = {
  playerId: string;
  dismissedHints: unknown;
  hintsMuted: unknown;
  onboardingChecklistCompleted: unknown;
  musterUnlockedSeasonId: unknown;
  profileStore: {
    setHintState: (playerId: string, patch: StoredHintState) => Promise<StoredHintState>;
  };
  invalidateProfileCache: (playerId: string) => void;
  sendJson: (payload: unknown) => void;
};

/** Hint-state fields injected onto the INIT message's `player` (gateway-app.ts) and echoed on HINT_STATE_SET, with the per-field defaults a fresh profile gets. */
export const hintStateInitFields = (profile: StoredHintState | undefined): Required<StoredHintState> => ({
  dismissedHints: profile?.dismissedHints ?? [],
  hintsMuted: profile?.hintsMuted ?? false,
  onboardingChecklistCompleted: profile?.onboardingChecklistCompleted ?? false,
  musterUnlockedSeasonId: profile?.musterUnlockedSeasonId ?? ""
});

export const handleSetHintStateMessage = async (deps: SetHintStateMessageDeps): Promise<void> => {
  const { playerId, dismissedHints, hintsMuted, onboardingChecklistCompleted, musterUnlockedSeasonId, profileStore, invalidateProfileCache, sendJson } = deps;
  const patch = {
    ...(Array.isArray(dismissedHints) && dismissedHints.every((id) => typeof id === "string")
      ? { dismissedHints: dismissedHints as string[] }
      : {}),
    ...(typeof hintsMuted === "boolean" ? { hintsMuted } : {}),
    ...(typeof onboardingChecklistCompleted === "boolean" ? { onboardingChecklistCompleted } : {}),
    ...(typeof musterUnlockedSeasonId === "string" && musterUnlockedSeasonId ? { musterUnlockedSeasonId } : {})
  };
  const updated = await profileStore.setHintState(playerId, patch);
  invalidateProfileCache(playerId);
  sendJson({ type: "HINT_STATE_SET", ...hintStateInitFields(updated) });
};
