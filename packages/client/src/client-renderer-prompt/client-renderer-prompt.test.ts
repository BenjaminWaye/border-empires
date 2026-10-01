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
        mapUnobstructed: true
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
        mapUnobstructed: true
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
        mapUnobstructed: true
      })
    ).toBe(false);
  });

  it("does not compete with any dialog that covers the map", () => {
    expect(
      shouldShowRendererPrompt({
        dismissed: false,
        true3DActive: true,
        sustainedLowFps: true,
        connectionInitialized: true,
        mapUnobstructed: false
      })
    ).toBe(false);
  });
});

describe("two-dimensional mode notice visibility", () => {
  const ready = {
    prefers2D: true,
    connectionInitialized: true,
    mapUnobstructed: true
  };

  it("shows for a chosen-2D session once the gameplay HUD is ready", () => {
    expect(shouldShowTwoDimensionalNotice(ready)).toBe(true);
  });
  it("never shows when 3D was wanted", () => {
    expect(shouldShowTwoDimensionalNotice({ ...ready, prefers2D: false })).toBe(false);
  });
  it("waits out the connection and anything covering the map", () => {
    expect(shouldShowTwoDimensionalNotice({ ...ready, connectionInitialized: false })).toBe(false);
    expect(shouldShowTwoDimensionalNotice({ ...ready, mapUnobstructed: false })).toBe(false);
  });
});
