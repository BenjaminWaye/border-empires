import { GUIDE_STORAGE_KEY, guideSteps } from "./client-constants.js";
import type { ClientState, storageSet } from "./client-state/client-state.js";

type GuideOverlayDeps = {
  state: Pick<ClientState, "guide" | "authSessionReady" | "profileSetupRequired" | "changelog"> & {
    activityDashboard?: { open: boolean };
  };
  guideOverlayEl: HTMLDivElement;
  storageSet: typeof storageSet;
  renderHud: () => void;
};

// Extracted out of renderClientHud (which is over the repo's 500-line cap
// and so may not grow) to match every sibling overlay's already-extracted
// shape (renderRespawnOverlay, renderJoinSeasonOverlay, renderSeasonEndOverlay,
// renderClientChangelogOverlay) -- the guide overlay was the one holdout still
// rendered inline. Also gates on the new Activity dashboard the same way it
// already gates on the changelog, so the two overlays never compete.
export const renderClientGuideOverlay = (deps: GuideOverlayDeps): void => {
  const { state, guideOverlayEl, storageSet, renderHud } = deps;
  const canShowGuide =
    state.guide.open &&
    state.authSessionReady &&
    !state.profileSetupRequired &&
    !state.changelog.open &&
    !state.activityDashboard?.open;
  guideOverlayEl.style.display = canShowGuide ? "grid" : "none";
  if (!canShowGuide) {
    if (guideOverlayEl.innerHTML) guideOverlayEl.innerHTML = "";
    return;
  }

  const step = guideSteps[Math.min(state.guide.stepIndex, guideSteps.length - 1)]!;
  guideOverlayEl.innerHTML = `
    <div class="guide-backdrop" id="guide-backdrop"></div>
    <div class="guide-modal card" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <button id="guide-close" class="guide-close-btn" type="button" aria-label="Close guide">×</button>
      <div class="guide-modal-scroll">
        <div class="guide-kicker">Step ${state.guide.stepIndex + 1} of ${guideSteps.length}</div>
        <h2 id="guide-title" class="guide-title">${step.title}</h2>
        <p class="guide-body">${step.body}</p>
        <div class="guide-progress">
          ${guideSteps.map((_, index) => `<span class="guide-progress-segment${index <= state.guide.stepIndex ? " is-active" : ""}"></span>`).join("")}
        </div>
        <div class="guide-actions">
          <button id="guide-skip" class="guide-link-btn" type="button">Skip Tutorial</button>
          <div class="guide-actions-right">
            ${state.guide.stepIndex > 0 ? '<button id="guide-back" class="panel-btn guide-secondary-btn" type="button">Back</button>' : ""}
            <button id="guide-next" class="panel-btn guide-primary-btn" type="button">${state.guide.stepIndex === guideSteps.length - 1 ? "Get Started" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const closeGuide = (markComplete: boolean): void => {
    state.guide.open = false;
    if (markComplete) {
      state.guide.completed = true;
      storageSet(GUIDE_STORAGE_KEY, "1");
    }
    renderHud();
  };
  const guideCloseBtn = guideOverlayEl.querySelector("#guide-close") as HTMLButtonElement | null;
  const guideBackdropBtn = guideOverlayEl.querySelector("#guide-backdrop") as HTMLDivElement | null;
  const guideSkipBtn = guideOverlayEl.querySelector("#guide-skip") as HTMLButtonElement | null;
  const guideBackBtn = guideOverlayEl.querySelector("#guide-back") as HTMLButtonElement | null;
  const guideNextBtn = guideOverlayEl.querySelector("#guide-next") as HTMLButtonElement | null;
  if (guideCloseBtn) guideCloseBtn.onclick = () => closeGuide(true);
  if (guideBackdropBtn) guideBackdropBtn.onclick = () => closeGuide(true);
  if (guideSkipBtn) guideSkipBtn.onclick = () => closeGuide(true);
  if (guideBackBtn) {
    guideBackBtn.onclick = () => {
      state.guide.stepIndex = Math.max(0, state.guide.stepIndex - 1);
      renderHud();
    };
  }
  if (guideNextBtn) {
    guideNextBtn.onclick = () => {
      if (state.guide.stepIndex >= guideSteps.length - 1) {
        closeGuide(true);
        return;
      }
      state.guide.stepIndex += 1;
      renderHud();
    };
  }
};
