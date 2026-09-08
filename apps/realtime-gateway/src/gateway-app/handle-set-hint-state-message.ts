// Persists a player's in-game hint/tutorial state (per-tip dismissals, the
// global "show hints" mute, and onboarding-checklist completion) on the
// gateway's player-profile row instead of client-side localStorage, so it
// survives a browser data clear and follows the player across devices.
export type SetHintStateMessageDeps = {
  playerId: string;
  dismissedHints: unknown;
  hintsMuted: unknown;
  onboardingChecklistCompleted: unknown;
  profileStore: {
    setHintState: (
      playerId: string,
      patch: { dismissedHints?: string[]; hintsMuted?: boolean; onboardingChecklistCompleted?: boolean }
    ) => Promise<{ dismissedHints?: string[]; hintsMuted?: boolean; onboardingChecklistCompleted?: boolean }>;
  };
  invalidateProfileCache: (playerId: string) => void;
  sendJson: (payload: unknown) => void;
};

export const handleSetHintStateMessage = async (deps: SetHintStateMessageDeps): Promise<void> => {
  const { playerId, dismissedHints, hintsMuted, onboardingChecklistCompleted, profileStore, invalidateProfileCache, sendJson } = deps;
  const patch = {
    ...(Array.isArray(dismissedHints) && dismissedHints.every((id) => typeof id === "string")
      ? { dismissedHints: dismissedHints as string[] }
      : {}),
    ...(typeof hintsMuted === "boolean" ? { hintsMuted } : {}),
    ...(typeof onboardingChecklistCompleted === "boolean" ? { onboardingChecklistCompleted } : {})
  };
  const updated = await profileStore.setHintState(playerId, patch);
  invalidateProfileCache(playerId);
  sendJson({
    type: "HINT_STATE_SET",
    dismissedHints: updated.dismissedHints ?? [],
    hintsMuted: updated.hintsMuted ?? false,
    onboardingChecklistCompleted: updated.onboardingChecklistCompleted ?? false
  });
};
