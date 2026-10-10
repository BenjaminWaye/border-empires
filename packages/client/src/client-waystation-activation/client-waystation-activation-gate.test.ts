// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WAYSTATION_POPUP_PENDING_DASHBOARD_GRACE_MS,
  resetWaystationPopupGateForTests,
  showWaystationActivationOverlayWhenClear,
  type WaystationPopupGateState
} from "./client-waystation-activation-gate.js";
import type { WaystationActivationInfo } from "./client-waystation-activation.js";

// A returning player logging in: the personal-activity
// request that opens the dashboard / What's New is still in flight.
const returningPlayerState = (): WaystationPopupGateState =>
  ({
    authSessionReady: true,
    profileSetupRequired: false,
    changelog: { open: false },
    needsSeasonJoin: false,
    joinSeasonOverlayOpen: false,
    respawnOverlayOpen: false,
    seasonWinner: undefined,
    seasonEndDismissed: false,
    activityDashboard: { open: false, loading: true }
  }) as unknown as WaystationPopupGateState;

const info: WaystationActivationInfo = {
  x: 3,
  y: 4,
  grantedEffect: "MANPOWER",
  revealedTown: false,
  grantedManpower: 100,
  onJumpToLocation: () => undefined
};

const popup = (): HTMLElement | null => document.getElementById("waystation-activation-overlay");

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  resetWaystationPopupGateForTests();
});

afterEach(() => {
  resetWaystationPopupGateForTests();
  vi.useRealTimers();
});

describe("showWaystationActivationOverlayWhenClear", () => {
  it("holds the popup while the dashboard (What's New) is still loading in, then shows it after the dashboard is dismissed", () => {
    const state = returningPlayerState();
    showWaystationActivationOverlayWhenClear(info, state);
    expect(popup()).toBeNull(); // before the dashboard opens

    state.activityDashboard.loading = false;
    state.activityDashboard.open = true; // What's New opens
    vi.advanceTimersByTime(1_000);
    expect(popup()).toBeNull(); // never painted over it

    state.activityDashboard.open = false; // player clicks What's New away
    vi.advanceTimersByTime(500);
    expect(popup()).not.toBeNull();
  });

  it("shows immediately when no dialog is open or pending", () => {
    const state = returningPlayerState();
    state.activityDashboard.loading = false;
    showWaystationActivationOverlayWhenClear(info, state);
    expect(popup()).not.toBeNull();
  });

  it("gives up waiting on a dropped activity request after the grace period", () => {
    const state = returningPlayerState();
    showWaystationActivationOverlayWhenClear(info, state);
    vi.advanceTimersByTime(WAYSTATION_POPUP_PENDING_DASHBOARD_GRACE_MS + 1_000);
    expect(popup()).not.toBeNull();
  });
});
