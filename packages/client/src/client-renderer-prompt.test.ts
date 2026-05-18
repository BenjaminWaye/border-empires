import { describe, expect, it } from "vitest";
import { shouldShowRendererPrompt, shouldWakeRendererPromptHud } from "./client-renderer-prompt.js";

describe("client renderer prompt", () => {
  it("wakes the HUD for sustained low FPS whenever true 3D is active", () => {
    expect(
      shouldWakeRendererPromptHud({
        dismissed: false,
        true3DActive: true,
        sustainedLowFps: true
      })
    ).toBe(true);
  });

  it("shows the prompt after low FPS once the gameplay HUD is ready", () => {
    expect(
      shouldShowRendererPrompt({
        dismissed: false,
        true3DActive: true,
        sustainedLowFps: true,
        connectionInitialized: true,
        authSessionReady: true,
        profileSetupRequired: false,
        changelogOpen: false,
        guideOpen: false
      })
    ).toBe(true);
  });

  it("does not show when the user already dismissed it", () => {
    expect(
      shouldShowRendererPrompt({
        dismissed: true,
        true3DActive: true,
        sustainedLowFps: true,
        connectionInitialized: true,
        authSessionReady: true,
        profileSetupRequired: false,
        changelogOpen: false,
        guideOpen: false
      })
    ).toBe(false);
  });

  it("waits until the gameplay HUD is ready before showing", () => {
    expect(
      shouldShowRendererPrompt({
        dismissed: false,
        true3DActive: true,
        sustainedLowFps: true,
        connectionInitialized: false,
        authSessionReady: true,
        profileSetupRequired: false,
        changelogOpen: false,
        guideOpen: false
      })
    ).toBe(false);
  });
});
