import { describe, expect, it } from "vitest";
import { shouldShowRendererPrompt, shouldShowTwoDimensionalNotice, shouldWakeRendererPromptHud } from "./client-renderer-prompt.js";

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
        changelogOpen: false
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
        changelogOpen: false
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
        changelogOpen: false
      })
    ).toBe(false);
  });

  it("does not compete with the Activity dashboard", () => {
    expect(
      shouldShowRendererPrompt({
        dismissed: false,
        true3DActive: true,
        sustainedLowFps: true,
        connectionInitialized: true,
        authSessionReady: true,
        profileSetupRequired: false,
        changelogOpen: false,
        activityDashboardOpen: true
      })
    ).toBe(false);
  });
});

describe("two-dimensional mode notice visibility", () => {
  const ready = {
    prefers2D: true,
    connectionInitialized: true,
    authSessionReady: true,
    profileSetupRequired: false,
    changelogOpen: false
  };

  it("shows for a chosen-2D session once the gameplay HUD is ready", () => {
    expect(shouldShowTwoDimensionalNotice(ready)).toBe(true);
  });
  it("never shows when 3D was wanted", () => {
    expect(shouldShowTwoDimensionalNotice({ ...ready, prefers2D: false })).toBe(false);
  });
  it("waits out sign-in, profile setup and open modals", () => {
    expect(shouldShowTwoDimensionalNotice({ ...ready, authSessionReady: false })).toBe(false);
    expect(shouldShowTwoDimensionalNotice({ ...ready, connectionInitialized: false })).toBe(false);
    expect(shouldShowTwoDimensionalNotice({ ...ready, profileSetupRequired: true })).toBe(false);
    expect(shouldShowTwoDimensionalNotice({ ...ready, changelogOpen: true })).toBe(false);
    expect(shouldShowTwoDimensionalNotice({ ...ready, activityDashboardOpen: true })).toBe(false);
  });
});
