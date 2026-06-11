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
  !input.guideOpen;
