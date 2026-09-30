export const RENDERER_PROMPT_FPS_THRESHOLD = 25;
export const RENDERER_PROMPT_LOW_FPS_MS = 5000;

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
  guideOpen: boolean;
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
  !input.guideOpen &&
  !input.activityDashboardOpen;

export type TwoDimensionalNoticeVisibilityInput = {
  prefers2D: boolean;
  connectionInitialized: boolean;
  authSessionReady: boolean;
  profileSetupRequired: boolean;
  changelogOpen: boolean;
  guideOpen: boolean;
  activityDashboardOpen?: boolean;
};

/**
 * The "you're on the 2D map" notice waits for the same gameplay-ready,
 * nothing-modal-open moment as the slow-3D prompt, so it doesn't pile onto
 * the login screen or the first-run guide.
 */
export const shouldShowTwoDimensionalNotice = (input: TwoDimensionalNoticeVisibilityInput): boolean =>
  input.prefers2D &&
  input.connectionInitialized &&
  input.authSessionReady &&
  !input.profileSetupRequired &&
  !input.changelogOpen &&
  !input.guideOpen &&
  !input.activityDashboardOpen;
