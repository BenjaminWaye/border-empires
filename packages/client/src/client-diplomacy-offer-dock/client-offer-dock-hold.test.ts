import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { POPUP_PENDING_DASHBOARD_GRACE_MS } from "../client-map-unobstructed/client-popup-gate.js";
import { createOfferDockHold } from "./client-offer-dock-hold.js";

// A returning player whose map is on screen and nothing is covering it.
const onScreen = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.connection = "initialized";
  state.hasEverInitialized = true;
  state.firstChunkAt = 1;
  state.mapPrep = null;
  state.changelog.seenAt = 1; // not a first-time visitor
  state.changelog.open = false;
  state.activityDashboard.open = false;
  state.activityDashboard.loading = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  return state;
};

describe("offer dock hold", () => {
  it("shows offers once the map is up and nothing covers it", () => {
    expect(createOfferDockHold()(onScreen(), 0)).toBe(false);
  });

  it("holds offers during the staged map build (the 'Placing towns and structures' step)", () => {
    const state = onScreen();
    state.mapPrep = { stage: "structures", index: 2, startedAt: 0, stageStartedAt: 0 };
    expect(createOfferDockHold()(state, 0)).toBe(true);
  });

  it("holds offers while the return briefing is on its way, up to the grace window", () => {
    const state = onScreen();
    state.activityDashboard.loading = true;
    const held = createOfferDockHold();
    expect(held(state, 0)).toBe(true);
    expect(held(state, POPUP_PENDING_DASHBOARD_GRACE_MS + 1)).toBe(false);
  });

  it("holds offers while the Chronicle is about to open or is open", () => {
    const pending = onScreen();
    pending.activityDashboard.open = true;
    expect(createOfferDockHold()(pending, 0)).toBe(true);
    const open = onScreen();
    open.activityDashboard.chronicleOpen = true;
    expect(createOfferDockHold()(open, 0)).toBe(true);
  });
});
