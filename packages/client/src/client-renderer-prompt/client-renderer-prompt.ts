export const RENDERER_PROMPT_FPS_THRESHOLD = 25;
export const RENDERER_PROMPT_LOW_FPS_MS = 5000;

export type RendererPromptWakeInput = {
  dismissed: boolean;
  true3DActive: boolean;
  sustainedLowFps: boolean;
};

export type RendererPromptVisibilityInput = RendererPromptWakeInput & {
  connectionInitialized: boolean;
  /** isMapUnobstructed(state) -- the single "no dialog covers the map" check shared with the AFC join drop. */
  mapUnobstructed: boolean;
};

export const shouldWakeRendererPromptHud = ({
  dismissed,
  true3DActive,
  sustainedLowFps
}: RendererPromptWakeInput): boolean => !dismissed && true3DActive && sustainedLowFps;

export const shouldShowRendererPrompt = (input: RendererPromptVisibilityInput): boolean =>
  shouldWakeRendererPromptHud(input) &&
  input.connectionInitialized &&
  input.mapUnobstructed;

export type TwoDimensionalNoticeVisibilityInput = {
  prefers2D: boolean;
  connectionInitialized: boolean;
  mapUnobstructed: boolean;
};

/**
 * The "you're on the 2D map" notice waits for the same gameplay-ready,
 * nothing-modal-open moment as the slow-3D prompt, so it doesn't pile onto
 * the login screen or the first-run guide.
 */
export const shouldShowTwoDimensionalNotice = (input: TwoDimensionalNoticeVisibilityInput): boolean =>
  input.prefers2D && input.connectionInitialized && input.mapUnobstructed;
