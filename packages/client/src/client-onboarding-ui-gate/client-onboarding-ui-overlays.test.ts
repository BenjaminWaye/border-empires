// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { discoveryTipPins, resetDiscoveryTipPinsForTests } from "../client-discovery-tips/client-discovery-tip-overlay.js";
import { enqueueDiscoveryTip } from "../client-discovery-tips/client-discovery-tips.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import {
  announceDiscoveryTipForState,
  refreshOnboardingChecklistHighlight,
  renderDiscoveryTipOverlayForState,
  tickOnboardingUiGateForFrame
} from "./client-onboarding-ui-overlays.js";

// Regression: the "First Town Discovered!" tip and the force-opened "New
// empire checklist" painted over the tutorial and the AFC landing. Both must
// wait until the dialog is closed and the join drop has finished. Tips are
// map pins now (client-map-tip-pins.ts); the same wait applies to the pins.

const joiningPlayerState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = true; // a dialog is up on join
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

const pinned = (): string[] => discoveryTipPins().map((pin) => pin.id);
const checklist = () => document.getElementById("onboarding-checklist-bubble");
const checklistPanel = () => document.getElementById("onboarding-checklist-panel");

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  resetDiscoveryTipPinsForTests();
  resetOnboardingChecklistOverlayForTests();
});

describe("onboarding corner UI waits for the tutorial and the AFC join drop", () => {
  it("keeps the town tip and checklist hidden through the tutorial and the drop, then shows them once the AFC has landed", () => {
    const state = joiningPlayerState();
    const renderHud = vi.fn();
    enqueueDiscoveryTip(state.discoveryTipQueue, "TOWN", state.authEmail, { x: 3, y: 3 });

    tickOnboardingUiGateForFrame(state, renderHud);
    renderDiscoveryTipOverlayForState(state, renderHud);
    refreshOnboardingChecklistHighlight(state);
    expect(pinned()).toEqual([]);
    expect(checklist()).toBeNull();

    state.changelog.open = false;
    state.afcJoinDrop.phase = "waiting";
    tickOnboardingUiGateForFrame(state, renderHud);
    state.afcJoinDrop.phase = "playing";
    tickOnboardingUiGateForFrame(state, renderHud);
    renderDiscoveryTipOverlayForState(state, renderHud);
    refreshOnboardingChecklistHighlight(state);
    expect(pinned()).toEqual([]);
    expect(checklist()).toBeNull();
    expect(state.discoveryTipQueue).toEqual(["TOWN"]);

    state.afcJoinDrop.phase = "done";
    tickOnboardingUiGateForFrame(state, renderHud);
    expect(pinned()).toEqual(["TOWN"]);
    expect(checklist()).not.toBeNull();
    // The once-per-account force-open was held back, not spent while hidden.
    expect(checklistPanel()?.hasAttribute("hidden")).toBe(false);
    expect(renderHud).toHaveBeenCalled();
  });

  it("queues a player-action tip announced while deferred instead of dropping it", () => {
    const state = joiningPlayerState();
    const renderHud = vi.fn();
    tickOnboardingUiGateForFrame(state, renderHud);

    announceDiscoveryTipForState(state, "FIRST_MUSTER", renderHud, { x: 5, y: 5 });
    expect(pinned()).toEqual([]);
    expect(state.discoveryTipQueue).toEqual(["FIRST_MUSTER"]);

    state.changelog.open = false;
    tickOnboardingUiGateForFrame(state, renderHud);
    expect(pinned()).toEqual(["FIRST_MUSTER"]);
  });

  it("does not pop the checklist up when the gate lifts before the first map chunk has arrived", () => {
    const state = joiningPlayerState();
    state.firstChunkAt = 0;
    const renderHud = vi.fn();
    tickOnboardingUiGateForFrame(state, renderHud);

    state.changelog.open = false;
    tickOnboardingUiGateForFrame(state, renderHud);
    expect(checklist()).toBeNull();
  });
});
