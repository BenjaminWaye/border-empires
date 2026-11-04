import { beforeEach, describe, expect, it } from "vitest";
import { LOW_FPS_WARMUP_MS, recordFrame, resetFpsMonitorForTests } from "../client-fps-monitor/client-fps-monitor.js";
import {
  hasRendererPromptLowFps,
  RENDERER_PROMPT_LOW_FPS_MS,
  resetRendererPromptLowFpsForTests,
  shouldShowRendererPrompt,
  shouldShowTwoDimensionalNotice,
  shouldWakeRendererPromptHud
} from "./client-renderer-prompt.js";

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

describe("renderer prompt low-fps warm-up", () => {
  const recordLowFps = (fromMs: number, toMs: number): number => {
    let t = fromMs;
    for (; t < toMs; t += 1000 / 12) recordFrame(t);
    return t;
  };
  const pollLowFps = (ready: boolean, fromMs: number, toMs: number): { t: number; fired: boolean } => {
    let t = fromMs;
    let fired = false;
    while (t < toMs) {
      t = recordLowFps(t, t + 500);
      fired = hasRendererPromptLowFps(ready, t) || fired;
    }
    return { t, fired };
  };

  beforeEach(() => {
    resetFpsMonitorForTests();
    resetRendererPromptLowFpsForTests();
  });

  it("does not fire for the jank burst right after gameplay becomes ready", () => {
    // Regression: a reconnect + re-INIT on a flagship phone produced ~15s of
    // 100ms+ long tasks, which popped "3D is running slow" every resume.
    let { t } = pollLowFps(false, 0, 2_000);
    const burst = pollLowFps(true, t, t + 15_000);
    expect(burst.fired).toBe(false);
    t = burst.t;
    // Reconnect drops readiness; the next ready edge restarts the warm-up.
    t = pollLowFps(false, t, t + 1_000).t;
    expect(pollLowFps(true, t, t + 15_000).fired).toBe(false);
  });

  it("still fires for steady-state low fps once warmed up", () => {
    const { t } = pollLowFps(true, 0, LOW_FPS_WARMUP_MS + 500);
    expect(pollLowFps(true, t, t + RENDERER_PROMPT_LOW_FPS_MS + 1_000).fired).toBe(true);
  });
});
