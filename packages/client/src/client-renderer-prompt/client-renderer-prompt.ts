import { LOW_FPS_WARMUP_MS, hasSustainedLowFps, holdLowFpsStreakUntil } from "../client-fps-monitor/client-fps-monitor.js";

export const RENDERER_PROMPT_FPS_THRESHOLD = 25;
export const RENDERER_PROMPT_LOW_FPS_MS = 8000;

let gameplayWasReady = false;

/**
 * Sustained-low-fps check for the "3D is running slow" prompt. Every time
 * gameplay becomes ready (first login, or a reconnect + re-INIT after the app
 * was backgrounded) the client does seconds of main-thread catch-up work that
 * tanks the frame rate even on flagship phones; those frames are ignored for
 * LOW_FPS_WARMUP_MS so the prompt only fires for steady-state slowness.
 */
export const hasRendererPromptLowFps = (gameplayReady: boolean, nowMs: number): boolean => {
  if (gameplayReady && !gameplayWasReady) holdLowFpsStreakUntil(nowMs + LOW_FPS_WARMUP_MS);
  gameplayWasReady = gameplayReady;
  return gameplayReady && hasSustainedLowFps(RENDERER_PROMPT_FPS_THRESHOLD, RENDERER_PROMPT_LOW_FPS_MS, nowMs);
};

export const resetRendererPromptLowFpsForTests = (): void => {
  gameplayWasReady = false;
};

export type RendererPromptWakeInput = {
  dismissed: boolean;
  true3DActive: boolean;
  sustainedLowFps: boolean;
};

export type RendererPromptVisibilityInput = RendererPromptWakeInput & {
  connectionInitialized: boolean;
  authSessionReady: boolean;
  profileSetupRequired: boolean;
  changelogOpen: boolean;
  // Optional (defaults to not-open) so the many existing call sites/tests
  // written before the Activity dashboard existed don't all need updating.
  activityDashboardOpen?: boolean;
};

export const shouldWakeRendererPromptHud = ({
  dismissed,
  true3DActive,
  sustainedLowFps
}: RendererPromptWakeInput): boolean => !dismissed && true3DActive && sustainedLowFps;

export const shouldShowRendererPrompt = (input: RendererPromptVisibilityInput): boolean =>
  shouldWakeRendererPromptHud(input) &&
  input.connectionInitialized &&
  input.authSessionReady &&
  !input.profileSetupRequired &&
  !input.changelogOpen &&
  !input.activityDashboardOpen;

export type TwoDimensionalNoticeVisibilityInput = {
  prefers2D: boolean;
  connectionInitialized: boolean;
  authSessionReady: boolean;
  profileSetupRequired: boolean;
  changelogOpen: boolean;
  activityDashboardOpen?: boolean;
};

/**
 * The "you're on the 2D map" notice waits for the same gameplay-ready,
 * nothing-modal-open moment as the slow-3D prompt, so it doesn't pile onto
 * the login screen or the What's New popup.
 */
export const shouldShowTwoDimensionalNotice = (input: TwoDimensionalNoticeVisibilityInput): boolean =>
  input.prefers2D &&
  input.connectionInitialized &&
  input.authSessionReady &&
  !input.profileSetupRequired &&
  !input.changelogOpen &&
  !input.activityDashboardOpen;
