import type { ClientState } from "../client-state/client-state.js";
import type { DiscoveryTipId, DiscoveryTipTarget } from "../client-discovery-tips/client-discovery-tips.js";
import { announceDiscoveryTip, renderDiscoveryTipOverlay } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { removeOnboardingChecklistOverlay, renderOnboardingChecklistOverlay } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { pushDiscoveryTipFeedEntry, type FeedMutableState } from "../client-alerts/client-alerts.js";
import { createOnboardingUiGateTicker, isOnboardingUiDeferred, isTutorialGuideDeferred, type OnboardingUiGateState } from "./client-onboarding-ui-gate.js";
import { isEnrolledInTutorialGuide, isTutorialGuideHoldingTips, renderTutorialGuide, syncTutorialGuidePlacement } from "../client-tutorial-guide/tutorial-guide.js";
import type { GuideTileProjector } from "../client-tutorial-guide/tutorial-guide-placement.js";
import { retireQueuedDiscoveryTips } from "../client-discovery-tips/client-discovery-tips.js";
import type { GuideInputState } from "../client-tutorial-guide/tutorial-guide-input.js";

// ClientState-aware entry points for the discovery-tip toast and the
// onboarding checklist bubble, so every caller applies the same
// client-onboarding-ui-gate.ts deferral instead of each re-deriving it.

export type DiscoveryTipUiState = OnboardingUiGateState & FeedMutableState & Pick<ClientState, "discoveryTipQueue" | "authEmail">;
export type OnboardingChecklistUiState = OnboardingUiGateState & GuideInputState & Pick<ClientState, "onboardingHighlightTiles" | "firstChunkAt">;

/** Tips the tutorial guide's "Find a town" / "Find food" steps already teach: retired while it holds tips. */
export const GUIDE_TAUGHT_DISCOVERY_TIPS: ReadonlySet<DiscoveryTipId> = new Set<DiscoveryTipId>(["TOWN", "FOOD"]);

/** Feedback on something that just happened (land that can be cut off, first contact, a first flag): never held. */
const URGENT_DISCOVERY_TIPS: ReadonlySet<DiscoveryTipId> = new Set<DiscoveryTipId>(["OUT_OF_REACH_EXPAND", "ENEMY_EMPIRE", "FIRST_MUSTER", "FIRST_DOCK"]);

const NOT_HELD = (): boolean => false;
const HELD_UNLESS_URGENT = (id: DiscoveryTipId): boolean => !URGENT_DISCOVERY_TIPS.has(id);

/**
 * While the tutorial guide's card is up on a step the player can do now, tips
 * stay quiet so there aren't two pieces of guidance at once: tips the guide
 * teaches are retired outright, and other tips (docks, strategic resources,
 * wonders, ...) wait unpinned in the queue until the guide is minimised, only
 * waiting on a first contact, finished or hidden. Urgent tips are never held.
 * Returns which queued tips are held.
 */
const holdDiscoveryTipsForGuide = (state: DiscoveryTipUiState): ((id: DiscoveryTipId) => boolean) => {
  if (!isTutorialGuideHoldingTips(state.authEmail)) return NOT_HELD;
  retireQueuedDiscoveryTips(state.discoveryTipQueue, GUIDE_TAUGHT_DISCOVERY_TIPS, state.authEmail);
  return HELD_UNLESS_URGENT;
};

/** Re-syncs the tip pins with the queue: none while deferred, only urgent ones while the tutorial guide holds tips. */
export const renderDiscoveryTipOverlayForState = (state: DiscoveryTipUiState, renderHud: () => void): void => {
  const held = holdDiscoveryTipsForGuide(state);
  renderDiscoveryTipOverlay(state.discoveryTipQueue, state.authEmail, renderHud, (def) => pushDiscoveryTipFeedEntry(state, def), isOnboardingUiDeferred(state), held);
};

/** Enqueues a player-action tip (first Muster Flag, out-of-reach expand) and pins it at `target` unless deferred or held; a deferred tip stays queued. */
export const announceDiscoveryTipForState = (state: DiscoveryTipUiState, id: DiscoveryTipId, renderHud: () => void, target?: DiscoveryTipTarget): void => {
  const held = holdDiscoveryTipsForGuide(state);
  announceDiscoveryTip(state.discoveryTipQueue, id, state.authEmail, renderHud, (def) => pushDiscoveryTipFeedEntry(state, def), isOnboardingUiDeferred(state), target, held);
};

/** Recomputes the onboarding checklist state/highlights from `state.tiles` and stores the result. Shared by the tile-delta-batch path and the spawn/initial-snapshot path in client-network.ts, so a fresh empire sees the checklist immediately instead of only after its first tile delta. */
export const refreshOnboardingChecklistHighlight = (state: OnboardingChecklistUiState): void => {
  if (isEnrolledInTutorialGuide(state.authEmail)) {
    // Players enrolled in the tutorial guide (every player, each season) get it instead of the checklist bubble (the
    // guide's "A foothold" chapter carries the same four goals), and keep
    // getting no bubble after finishing or hiding the guide.
    removeOnboardingChecklistOverlay();
    state.onboardingHighlightTiles = renderTutorialGuide(state, isTutorialGuideDeferred(state));
    return;
  }
  state.onboardingHighlightTiles = renderOnboardingChecklistOverlay(state.tiles, state.me, state.authEmail, isOnboardingUiDeferred(state));
};

const tickGate = createOnboardingUiGateTicker();
// Whether the tutorial guide held tips last frame: they show the frame it stops (minimised, waiting, finished, hidden).
let guideWasHoldingTips: boolean | undefined;

/** Test-only: forgets last frame's hold state. */
export const resetOnboardingUiOverlaysForTests = (): void => {
  guideWasHoldingTips = undefined;
};

/**
 * Called once per frame, after the AFC join drop has ticked: re-renders the
 * toast and checklist as soon as the deferral lifts (drop landed, dialog
 * closed) or returns (a dialog reopened), rather than on the next tile delta.
 */
export const tickOnboardingUiGateForFrame = (state: DiscoveryTipUiState & OnboardingChecklistUiState, renderHud: () => void, project?: GuideTileProjector): void => {
  tickGate(state, () => {
    renderDiscoveryTipOverlayForState(state, renderHud);
    // Before the player's first map chunk the checklist has nothing to judge
    // (it would show every goal open); the spawn/chunk path renders it then.
    if (state.me && state.firstChunkAt > 0) refreshOnboardingChecklistHighlight(state);
    renderHud();
  });
  const guideHolding = isTutorialGuideHoldingTips(state.authEmail);
  if (guideWasHoldingTips !== undefined && guideWasHoldingTips !== guideHolding) renderDiscoveryTipOverlayForState(state, renderHud);
  guideWasHoldingTips = guideHolding;
  // The guide also completes steps on input with no tile change (a pan, an
  // opened panel), so it is evaluated every frame; tile scans are cached per
  // tiles revision and the card only re-renders when its content changes.
  // Enrolled rather than running, so the frame after Skip guide / Finish
  // clears the guide's map rings instead of leaving them until a tile delta.
  if (state.me && state.firstChunkAt > 0 && isEnrolledInTutorialGuide(state.authEmail)) {
    state.onboardingHighlightTiles = renderTutorialGuide(state, isTutorialGuideDeferred(state));
    syncTutorialGuidePlacement(project, performance.now());
  }
};
