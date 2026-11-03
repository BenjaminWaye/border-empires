import type { ClientState } from "../client-state/client-state.js";
import type { DiscoveryTipId, DiscoveryTipTarget } from "../client-discovery-tips/client-discovery-tips.js";
import { announceDiscoveryTip, renderDiscoveryTipOverlay } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { removeOnboardingChecklistOverlay, renderOnboardingChecklistOverlay } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { pushDiscoveryTipFeedEntry, type FeedMutableState } from "../client-alerts/client-alerts.js";
import { createOnboardingUiGateTicker, isOnboardingUiDeferred, type OnboardingUiGateState } from "./client-onboarding-ui-gate.js";
import { isEnrolledInTutorialGuide, renderTutorialGuide } from "../client-tutorial-guide/tutorial-guide.js";
import type { GuideInputState } from "../client-tutorial-guide/tutorial-guide-input.js";

// ClientState-aware entry points for the discovery-tip toast and the
// onboarding checklist bubble, so every caller applies the same
// client-onboarding-ui-gate.ts deferral instead of each re-deriving it.

export type DiscoveryTipUiState = OnboardingUiGateState & FeedMutableState & Pick<ClientState, "discoveryTipQueue" | "authEmail">;
export type OnboardingChecklistUiState = OnboardingUiGateState & GuideInputState & Pick<ClientState, "onboardingHighlightTiles" | "firstChunkAt">;

/** Re-renders the discovery-tip toast for the front of the queue, or hides it while deferred. */
export const renderDiscoveryTipOverlayForState = (state: DiscoveryTipUiState, renderHud: () => void): void =>
  renderDiscoveryTipOverlay(state.discoveryTipQueue, state.authEmail, renderHud, (def) => pushDiscoveryTipFeedEntry(state, def), isOnboardingUiDeferred(state));

/** Enqueues a player-action tip (first Muster Flag, out-of-reach expand) and shows it unless deferred, with `target` as the tile its Center button jumps to; a deferred tip stays queued. */
export const announceDiscoveryTipForState = (state: DiscoveryTipUiState, id: DiscoveryTipId, renderHud: () => void, target?: DiscoveryTipTarget): void =>
  announceDiscoveryTip(state.discoveryTipQueue, id, state.authEmail, renderHud, (def) => pushDiscoveryTipFeedEntry(state, def), isOnboardingUiDeferred(state), target);

/** Recomputes the onboarding checklist state/highlights from `state.tiles` and stores the result. Shared by the tile-delta-batch path and the spawn/initial-snapshot path in client-network.ts, so a fresh empire sees the checklist immediately instead of only after its first tile delta. */
export const refreshOnboardingChecklistHighlight = (state: OnboardingChecklistUiState): void => {
  if (isEnrolledInTutorialGuide(state.authEmail)) {
    // New accounts get the tutorial guide instead of the checklist bubble (the
    // guide's "A foothold" chapter carries the same four goals), and keep
    // getting no bubble after finishing or hiding the guide.
    removeOnboardingChecklistOverlay();
    state.onboardingHighlightTiles = renderTutorialGuide(state, isOnboardingUiDeferred(state));
    return;
  }
  state.onboardingHighlightTiles = renderOnboardingChecklistOverlay(state.tiles, state.me, state.authEmail, isOnboardingUiDeferred(state));
};

const tickGate = createOnboardingUiGateTicker();

/**
 * Called once per frame, after the AFC join drop has ticked: re-renders the
 * toast and checklist as soon as the deferral lifts (drop landed, dialog
 * closed) or returns (a dialog reopened), rather than on the next tile delta.
 */
export const tickOnboardingUiGateForFrame = (state: DiscoveryTipUiState & OnboardingChecklistUiState, renderHud: () => void): void => {
  tickGate(state, () => {
    renderDiscoveryTipOverlayForState(state, renderHud);
    // Before the player's first map chunk the checklist has nothing to judge
    // (it would show every goal open); the spawn/chunk path renders it then.
    if (state.me && state.firstChunkAt > 0) refreshOnboardingChecklistHighlight(state);
    renderHud();
  });
  // The guide also completes steps on input with no tile change (a pan, an
  // opened panel), so it is evaluated every frame; tile scans are cached per
  // tiles revision and the card only re-renders when its content changes.
  // Enrolled rather than running, so the frame after Hide guide / Finish
  // clears the guide's map rings instead of leaving them until a tile delta.
  if (state.me && state.firstChunkAt > 0 && isEnrolledInTutorialGuide(state.authEmail)) {
    state.onboardingHighlightTiles = renderTutorialGuide(state, isOnboardingUiDeferred(state));
  }
};
