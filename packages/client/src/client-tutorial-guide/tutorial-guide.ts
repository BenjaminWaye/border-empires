// The new-account tutorial guide's controller. Runs every frame (from
// client-onboarding-ui-overlays.ts's frame tick) for an account enrolled in
// the guide (tutorial-guide-storage.ts): evaluates the steps against the
// current state, persists newly completed steps, keeps the corner card and
// HUD-button outline in sync, and returns the map tiles to ring. Those tiles
// go into state.onboardingHighlightTiles, which both map renderers already
// draw (client-onboarding-checklist-highlight.ts for 2D,
// client-map-3d-onboarding-checklist-highlight.ts for true-3D), so every map
// highlight the guide shows is in both renderers by construction.
//
// For an enrolled account the guide replaces the New empire checklist bubble
// (its four goals are the guide's "A foothold" chapter). Accounts that are
// not enrolled -- every account older than the guide -- keep the checklist.

import { buildGuideInput, type GuideInputState } from "./tutorial-guide-input.js";
import { evaluateGuide, GUIDE_STEPS, guideBeaconSite, needsTownForBuild, guideRecommendsAfcUpgrade, guideRecommendsManifest, RECOMMENDED_FIRST_AFC_UPGRADE_ID, RECOMMENDED_FIRST_MANIFEST_ID, type GuideView } from "./tutorial-guide-steps.js";
import { isGuideActive, markGuideStepsCompleted, readGuideProgress, setGuideStatus } from "./tutorial-guide-storage.js";
import {
  guideCardCoversScreenCentre,
  removeGuideCard,
  renderGuideCard,
  renderGuideCompleteCard,
  syncGuideCardLayer,
  type GuideCardHandlers
} from "./tutorial-guide-card.js";
import { syncGuideManifestPick } from "./tutorial-guide-manifest-pick.js";
import { setGuideManufactoryTargets } from "./tutorial-guide-manufactory-recommendation.js";
import { syncGuideAfcPick } from "./tutorial-guide-afc-pick.js";
import { removeGuideAnchorOutline, syncGuideAnchorOutline } from "./tutorial-guide-anchor.js";
import { resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { debugAuthIdentityKeyForEmail } from "../client-debug/client-debug.js";
import { centerCameraOnDiscoveryTarget } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { setOnboardingRelayBeaconSite } from "../client-onboarding-checklist/client-onboarding-relay-beacon-recommendation.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "../client-onboarding-checklist/client-onboarding-checklist-storage.js";

type StepView = Extract<GuideView, { kind: "step" }>;

let expanded = true;
let lastSignature = "";
let lastView: StepView | undefined;
let lastAuthEmail: string | null | undefined;
let lastIdentityKey: string | undefined;
// The last state rendered for, so a card button can re-render immediately
// instead of waiting for the next frame tick.
let lastState: GuideInputState | undefined;
let showMeIndex = 0;
let checklistFlagSynced = false;

const forceRerender = (): void => {
  lastSignature = "";
  if (lastState) renderTutorialGuide(lastState, false);
};

const handlers: GuideCardHandlers = {
  onShowMe: () => {
    const tiles = lastView?.highlightTiles ?? [];
    if (tiles.length === 0) return;
    const target = tiles[showMeIndex % tiles.length]!;
    showMeIndex += 1;
    centerCameraOnDiscoveryTarget({ x: target.x, y: target.y });
    // The camera centres the target; on a phone the card covers the centre, so fold it to its launcher.
    if (guideCardCoversScreenCentre()) {
      expanded = false;
      forceRerender();
    }
  },
  onSkip: () => {
    if (lastView) markGuideStepsCompleted([lastView.step.id], lastAuthEmail);
    forceRerender();
  },
  // Finish ends the guide even when Contest / Diplomacy are still waiting for a
  // first contact: the First Contact discovery tip covers muster flags later.
  onFinish: () => {
    if (lastView) markGuideStepsCompleted([lastView.step.id], lastAuthEmail);
    setGuideStatus("done", lastAuthEmail);
    setOnboardingRelayBeaconSite(undefined);
    removeTutorialGuideUi();
    const doneIds = new Set(readGuideProgress(lastAuthEmail).steps);
    renderGuideCompleteCard(GUIDE_STEPS.filter((s) => doneIds.has(s.id)).length, GUIDE_STEPS.length);
  },
  onHide: () => {
    setGuideStatus("dismissed", lastAuthEmail);
    setOnboardingRelayBeaconSite(undefined);
    removeTutorialGuideUi();
  },
  onToggle: () => {
    expanded = !expanded;
    forceRerender();
  }
};

export const removeTutorialGuideUi = (): void => {
  removeGuideCard();
  removeGuideAnchorOutline();
  syncGuideManifestPick(undefined);
  syncGuideAfcPick(undefined);
  setGuideManufactoryTargets(undefined);
  lastSignature = "";
  lastView = undefined;
};

/**
 * True while the guide card is up, expanded, on a step the player can do now:
 * discovery tips then wait so the corner isn't crowded. A minimised card, or a
 * guide only waiting on a first contact (which can take a whole season), lets
 * them through. Before the first render the guide counts as holding.
 */
export const isTutorialGuideHoldingTips = (authEmail: string | null | undefined): boolean =>
  isGuideActive(authEmail) && (lastView === undefined || (expanded && !lastView.waiting));

/** True while this account has the guide running (enrolled and not finished or hidden). */
export const isTutorialGuideRunning = (authEmail: string | null | undefined): boolean => isGuideActive(authEmail);

/**
 * True for any account that was enrolled in the guide, running or not. Such an
 * account never falls back to the New empire checklist bubble: after Finish or
 * Hide guide the corner stays empty instead of showing a different UI.
 */
export const isEnrolledInTutorialGuide = (authEmail: string | null | undefined): boolean => readGuideProgress(authEmail).status !== "";

/** A HUD v2 full-screen view is open (client-hud-v2-context.ts sets the body class). */
const bodyHasScreenOpen = (): boolean => typeof document !== "undefined" && document.body.classList.contains("hud-v2-screen-open");

const signatureOf = (view: StepView): string =>
  [view.step.id, view.title, view.why, view.lookFor?.join(",") ?? "", view.laterChapterTitles.join(","), view.completedCount, view.waiting, view.highlightTiles.length > 0, expanded].join("|");

/**
 * Evaluates and renders the guide. Returns the map tiles to highlight (empty
 * while the guide is hidden, finished or `deferred` -- see
 * client-onboarding-ui-gate.ts: a dialog covers the map or the AFC landing
 * hasn't finished).
 */
export const renderTutorialGuide = (state: GuideInputState, deferred: boolean): Array<{ x: number; y: number }> => {
  // A different account signed in on this page: nothing from the previous
  // one (input signals, minimised card, synced checklist flag) carries over.
  // Compared by storage scope, not email: every guest's email is "", but each guest has its own scope.
  if (lastState && lastIdentityKey !== debugAuthIdentityKeyForEmail(state.authEmail)) {
    removeTutorialGuideUi();
    resetTutorialGuideForTests();
    resetGuideInputSignalsForTests();
  }
  lastAuthEmail = state.authEmail;
  lastIdentityKey = debugAuthIdentityKeyForEmail(state.authEmail);
  lastState = state;
  if (!state.me || !isGuideActive(state.authEmail)) {
    if (lastView) {
      setOnboardingRelayBeaconSite(undefined);
      removeTutorialGuideUi();
    }
    return [];
  }
  const input = buildGuideInput(state);
  // Keep the account-level checklist flag in step with the guide's foothold
  // chapter, as the checklist bubble does for accounts without the guide.
  if (input.checklist.step === "DONE" && !checklistFlagSynced) {
    checklistFlagSynced = true;
    if (!isOnboardingChecklistCompleted(state.authEmail)) markOnboardingChecklistCompleted(state.authEmail);
  }
  const view = evaluateGuide(input, new Set(readGuideProgress(state.authEmail).steps));
  if (view.kind === "step" && view.newlyCompleted.length > 0) markGuideStepsCompleted(view.newlyCompleted, state.authEmail);
  if (view.kind === "done") {
    setGuideStatus("done", state.authEmail);
    setOnboardingRelayBeaconSite(undefined);
    removeTutorialGuideUi();
    return [];
  }
  setOnboardingRelayBeaconSite(!deferred && !view.waiting ? guideBeaconSite(view.step.id, input) : undefined);
  if (deferred) {
    if (lastView) removeTutorialGuideUi();
    return [];
  }
  if (lastView?.step.id !== view.step.id) showMeIndex = 0;
  lastView = view;
  const signature = signatureOf(view);
  if (signature !== lastSignature) {
    lastSignature = signature;
    renderGuideCard(view, expanded, handlers);
  }
  // Without a town the build step points at a town to take, not at Manufactory sites.
  const manufactoryStep = view.step.id === "build-first" && !needsTownForBuild(input);
  const buildAnchor = manufactoryStep && input.manufactoryUnlocked ? "manufactory" : undefined;
  syncGuideAnchorOutline(expanded ? buildAnchor ?? view.anchor : undefined);
  // Not over Settings: on the new HUD its modal dim shares the raised layer.
  syncGuideCardLayer((input.openPanel !== null && input.openPanel !== "settings") || bodyHasScreenOpen(), input.openPanel === "manpower", input.openPanel !== null || bodyHasScreenOpen());
  syncGuideManifestPick(!view.waiting && guideRecommendsManifest(view.step.id) ? RECOMMENDED_FIRST_MANIFEST_ID : undefined);
  setGuideManufactoryTargets(manufactoryStep && !view.waiting ? view.highlightTiles : undefined);
  syncGuideAfcPick(!view.waiting && guideRecommendsAfcUpgrade(view.step.id) ? RECOMMENDED_FIRST_AFC_UPGRADE_ID : undefined);
  return [...view.highlightTiles];
};

/** Settings "Restart guide": reopen the card on the first unfinished step. */
export const reopenTutorialGuideCard = (): void => {
  expanded = true;
  lastSignature = "";
};

/** Resets module state that persists across renders (account switch, and tests). */
export const resetTutorialGuideForTests = (): void => {
  expanded = true;
  lastSignature = "";
  lastView = undefined;
  lastAuthEmail = undefined;
  lastIdentityKey = undefined;
  lastState = undefined;
  showMeIndex = 0;
  checklistFlagSynced = false;
};
