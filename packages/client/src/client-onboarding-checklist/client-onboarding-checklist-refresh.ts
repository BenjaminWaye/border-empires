import type { ClientState } from "../client-state/client-state.js";
import { isAfcJoinDropHoldingUi } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { isOnboardingChecklistAutoOpenDeferred, renderOnboardingChecklistOverlay } from "./client-onboarding-checklist-overlay.js";

/** Recomputes the onboarding checklist state/highlights from `state.tiles` and stores the result. Shared by the tile-delta-batch path, the spawn/initial-snapshot path in client-network.ts, and the join-drop tick (via flushDeferredOnboardingAutoOpen). */
export const refreshOnboardingChecklistHighlight = (
  state: Pick<ClientState, "tiles" | "me" | "authEmail" | "onboardingHighlightTiles" | "afcJoinDrop" | "tilesRevision">
): void => {
  state.onboardingHighlightTiles = renderOnboardingChecklistOverlay(state.tiles, state.me, state.authEmail, {
    holdAutoOpen: isAfcJoinDropHoldingUi(state.afcJoinDrop, state.tilesRevision)
  });
};

/** Called by the join-drop tick when the drop stops holding the UI: performs the checklist's deferred one-time auto-open. No-op (no DOM churn) unless a held render actually deferred it. */
export const flushDeferredOnboardingAutoOpen = (state: Parameters<typeof refreshOnboardingChecklistHighlight>[0]): void => {
  if (isOnboardingChecklistAutoOpenDeferred()) refreshOnboardingChecklistHighlight(state);
};
