// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { renderDiscoveryTipOverlay } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import {
  announceDiscoveryTipForState,
  refreshOnboardingChecklistHighlight,
  renderDiscoveryTipOverlayForState,
  tickOnboardingUiGateForFrame
} from "./client-onboarding-ui-overlays.js";

// Regression: the "First Town Discovered!" toast and the force-opened "New
// empire checklist" painted over the tutorial and the AFC landing. Both must
// wait until the tutorial is closed and the join drop has finished.

const joiningPlayerState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.guide.open = true; // tutorial up on join
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  state.me = "p1";
  state.authEmail = "new@example.com";
  state.firstChunkAt = 1;
  return state;
};

const toast = () => document.getElementById("discovery-tip-overlay");
const checklist = () => document.getElementById("onboarding-checklist-bubble");
const checklistPanel = () => document.getElementById("onboarding-checklist-panel");

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  renderDiscoveryTipOverlay([], "reset@example.com", vi.fn()); // reset the toast's module-level "showing" id
  resetOnboardingChecklistOverlayForTests();
});

describe("onboarding corner UI waits for the tutorial and the AFC join drop", () => {
  it("keeps the town tip and checklist hidden through the tutorial and the drop, then shows them once the AFC has landed", () => {
    const state = joiningPlayerState();
    const renderHud = vi.fn();
    state.discoveryTipQueue.push("TOWN");

    tickOnboardingUiGateForFrame(state, renderHud);
    renderDiscoveryTipOverlayForState(state, renderHud);
    refreshOnboardingChecklistHighlight(state);
    expect(toast()).toBeNull();
    expect(checklist()).toBeNull();

    state.guide.open = false;
    state.afcJoinDrop.phase = "waiting";
    tickOnboardingUiGateForFrame(state, renderHud);
    state.afcJoinDrop.phase = "playing";
    tickOnboardingUiGateForFrame(state, renderHud);
    renderDiscoveryTipOverlayForState(state, renderHud);
    refreshOnboardingChecklistHighlight(state);
    expect(toast()).toBeNull();
    expect(checklist()).toBeNull();
    expect(state.discoveryTipQueue).toEqual(["TOWN"]);

    state.afcJoinDrop.phase = "done";
    tickOnboardingUiGateForFrame(state, renderHud);
    expect(toast()?.textContent).toContain("First Town Discovered!");
    expect(checklist()).not.toBeNull();
    // The once-per-account force-open was held back, not spent while hidden.
    expect(checklistPanel()?.hasAttribute("hidden")).toBe(false);
    expect(renderHud).toHaveBeenCalled();
  });

  it("queues a player-action tip announced while deferred instead of dropping it", () => {
    const state = joiningPlayerState();
    const renderHud = vi.fn();
    tickOnboardingUiGateForFrame(state, renderHud);

    announceDiscoveryTipForState(state, "FIRST_MUSTER", renderHud);
    expect(toast()).toBeNull();
    expect(state.discoveryTipQueue).toEqual(["FIRST_MUSTER"]);

    state.guide.open = false;
    tickOnboardingUiGateForFrame(state, renderHud);
    expect(toast()?.textContent).toContain("First Muster Flag Placed!");
  });

  it("does not pop the checklist up when the gate lifts before the first map chunk has arrived", () => {
    const state = joiningPlayerState();
    state.firstChunkAt = 0;
    const renderHud = vi.fn();
    tickOnboardingUiGateForFrame(state, renderHud);

    state.guide.open = false;
    tickOnboardingUiGateForFrame(state, renderHud);
    expect(checklist()).toBeNull();
  });
});
