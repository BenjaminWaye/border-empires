import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { AfcJoinDropPhase } from "../client-afc-join-drop/client-afc-join-drop-state.js";
import { createOnboardingUiGateTicker, isOnboardingUiDeferred, isTutorialGuideDeferred } from "./client-onboarding-ui-gate.js";

const clearState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.changelog.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  return state;
};

describe("isOnboardingUiDeferred", () => {
  it("is false with the map clear and no AFC drop pending", () => {
    expect(isOnboardingUiDeferred(clearState())).toBe(false);
  });

  it("is true while a dialog covers the map", () => {
    const state = clearState();
    state.changelog.open = true;
    expect(isOnboardingUiDeferred(state)).toBe(true);
  });

  it.each<[AfcJoinDropPhase, boolean]>([
    ["idle", false],
    ["waiting", true],
    ["playing", true],
    ["done", false]
  ])("with the AFC join drop %s, deferred is %s", (phase, expected) => {
    const state = clearState();
    state.afcJoinDrop.phase = phase;
    expect(isOnboardingUiDeferred(state)).toBe(expected);
  });
});

describe("isTutorialGuideDeferred", () => {
  it("holds the guide while the 3D map is still being drawn after sign-in", () => {
    // Playtest: "Tap your manpower gauge" showed over the "Drawing your map..." overlay.
    const state = clearState();
    state.firstChunkAt = 1;
    state.mapPrep = { stage: "firstFrame", index: 4, startedAt: 1, stageStartedAt: 1 };
    expect(isTutorialGuideDeferred(state)).toBe(true);
    state.mapPrep = null;
    expect(isTutorialGuideDeferred(state)).toBe(false);
  });
});

describe("createOnboardingUiGateTicker", () => {
  it("fires only on transitions, not on the first tick or while unchanged", () => {
    const tick = createOnboardingUiGateTicker();
    const onChange = vi.fn();
    const state = clearState();
    state.changelog.open = true;

    tick(state, onChange);
    tick(state, onChange);
    expect(onChange).not.toHaveBeenCalled();

    // Dialog closes -> the drop arms and plays: still deferred, no change.
    state.changelog.open = false;
    state.afcJoinDrop.phase = "waiting";
    tick(state, onChange);
    state.afcJoinDrop.phase = "playing";
    tick(state, onChange);
    expect(onChange).not.toHaveBeenCalled();

    // The AFC lands: released exactly once.
    state.afcJoinDrop.phase = "done";
    tick(state, onChange);
    tick(state, onChange);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(false);

    // Reopening a dialog hides the corner UI again.
    state.changelog.open = true;
    tick(state, onChange);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});
