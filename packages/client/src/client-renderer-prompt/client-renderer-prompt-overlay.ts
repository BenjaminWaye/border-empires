// The renderer overlays owned by the HUD: the "3D is running slow" modal and
// the once-per-session "you're on the 2D map" notice. Split out of
// client-hud.ts (already over the repo's per-file line cap) — the HUD only
// hands over its state, DOM slot and re-render callback.
import { RENDERER_PROMPT_STORAGE_KEY } from "../client-constants.js";
import { buildDiagnosticsBundle, downloadDiagnosticsBundle } from "../client-diagnostics.js";
import { hasSustainedLowFps } from "../client-fps-monitor/client-fps-monitor.js";
import { showTwoDimensionalModeNotice } from "../client-renderer-fallback-notice/client-renderer-fallback-notice.js";
import { isTrue3DRendererActive, prefers2DRendererMode } from "../client-renderer-mode.js";
import { switchRenderer } from "../client-renderer-switch/client-renderer-switch.js";
import type { ClientState, storageSet } from "../client-state/client-state.js";
import {
  RENDERER_PROMPT_FPS_THRESHOLD,
  RENDERER_PROMPT_LOW_FPS_MS,
  shouldShowRendererPrompt,
  shouldShowTwoDimensionalNotice
} from "./client-renderer-prompt.js";

export type RendererPromptOverlayDeps = {
  readonly state: ClientState;
  readonly overlayEl: HTMLDivElement;
  readonly wsUrl: string;
  readonly storageSet: typeof storageSet;
  readonly renderHud: () => void;
};

export const renderRendererPromptOverlay = (deps: RendererPromptOverlayDeps): void => {
  const { state, overlayEl, wsUrl } = deps;

  if (
    shouldShowTwoDimensionalNotice({
      prefers2D: prefers2DRendererMode,
      connectionInitialized: state.connection === "initialized",
      authSessionReady: state.authSessionReady,
      profileSetupRequired: state.profileSetupRequired,
      changelogOpen: state.changelog.open,
      guideOpen: state.guide.open,
      activityDashboardOpen: state.activityDashboard.open
    })
  ) {
    showTwoDimensionalModeNotice({ onSwitchTo3D: () => switchRenderer("3d") });
  }

  const canShowRendererPrompt = shouldShowRendererPrompt({
    dismissed: state.rendererPrompt.dismissed,
    true3DActive: isTrue3DRendererActive(),
    sustainedLowFps: hasSustainedLowFps(RENDERER_PROMPT_FPS_THRESHOLD, RENDERER_PROMPT_LOW_FPS_MS, performance.now()),
    connectionInitialized: state.connection === "initialized",
    authSessionReady: state.authSessionReady,
    profileSetupRequired: state.profileSetupRequired,
    changelogOpen: state.changelog.open,
    guideOpen: state.guide.open,
    activityDashboardOpen: state.activityDashboard.open
  });
  overlayEl.style.display = canShowRendererPrompt ? "grid" : "none";
  if (!canShowRendererPrompt) {
    if (overlayEl.innerHTML) overlayEl.innerHTML = "";
    return;
  }

  overlayEl.innerHTML = `
      <div class="guide-backdrop" id="renderer-prompt-backdrop"></div>
      <div class="guide-modal card" role="dialog" aria-modal="true" aria-labelledby="renderer-prompt-title">
        <div class="guide-modal-scroll">
          <h2 id="renderer-prompt-title" class="guide-title">3D is running slow on this device</h2>
          <p class="guide-body">Your device is rendering the 3D map at a low frame rate. Switch to the lighter 2D version for smoother performance? You can switch back any time in Settings → Gameplay → Map Renderer.</p>
          <div class="guide-actions">
            <button id="renderer-prompt-keep" class="panel-btn guide-secondary-btn" type="button">Keep 3D</button>
            <button id="renderer-prompt-switch" class="panel-btn guide-primary-btn" type="button">Switch to 2D</button>
          </div>
          <button id="renderer-prompt-download" class="panel-btn guide-secondary-btn renderer-prompt-download-btn" type="button">Download Diagnostics</button>
        </div>
      </div>
    `;
  const dismissPrompt = (): void => {
    state.rendererPrompt.dismissed = true;
    deps.storageSet(RENDERER_PROMPT_STORAGE_KEY, "1");
    deps.renderHud();
  };
  const keepBtn = overlayEl.querySelector("#renderer-prompt-keep") as HTMLButtonElement | null;
  const switchBtn = overlayEl.querySelector("#renderer-prompt-switch") as HTMLButtonElement | null;
  const backdropEl = overlayEl.querySelector("#renderer-prompt-backdrop") as HTMLDivElement | null;
  if (keepBtn) keepBtn.onclick = dismissPrompt;
  if (backdropEl) backdropEl.onclick = dismissPrompt;
  if (switchBtn) {
    switchBtn.onclick = (): void => {
      deps.storageSet(RENDERER_PROMPT_STORAGE_KEY, "1");
      switchRenderer("2d");
    };
  }
  const downloadBtn = overlayEl.querySelector("#renderer-prompt-download") as HTMLButtonElement | null;
  if (downloadBtn) {
    downloadBtn.onclick = (): void => {
      downloadDiagnosticsBundle(buildDiagnosticsBundle(state, wsUrl));
    };
  }
};
