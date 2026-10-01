import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { isMapUnobstructed } from "./client-map-unobstructed.js";

const clearState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.guide.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.ruinsPromptOpen = false;
  state.seasonWinner = undefined;
  return state;
};

describe("isMapUnobstructed", () => {
  it("is true when signed in with no overlay open", () => {
    expect(isMapUnobstructed(clearState())).toBe(true);
  });

  it.each([
    ["signed out", (s: ReturnType<typeof clearState>) => { s.authSessionReady = false; }],
    ["profile setup pending", (s: ReturnType<typeof clearState>) => { s.profileSetupRequired = true; }],
    ["changelog open", (s: ReturnType<typeof clearState>) => { s.changelog.open = true; }],
    ["tutorial open", (s: ReturnType<typeof clearState>) => { s.guide.open = true; }],
    ["activity dashboard open", (s: ReturnType<typeof clearState>) => { s.activityDashboard.open = true; }],
    ["join-season lobby full-screen", (s: ReturnType<typeof clearState>) => { s.needsSeasonJoin = true; s.joinSeasonOverlayOpen = true; }],
    ["respawn notice open", (s: ReturnType<typeof clearState>) => { s.respawnOverlayOpen = true; }],
    ["empire-in-ruins popup open", (s: ReturnType<typeof clearState>) => { s.ruinsPromptOpen = true; }]
  ])("is false while %s", (_label, block) => {
    const state = clearState();
    block(state);
    expect(isMapUnobstructed(state)).toBe(false);
  });

  it("is false while the season-end overlay is showing, and true once dismissed", () => {
    const state = clearState();
    state.seasonWinner = { playerId: "p2" } as NonNullable<typeof state.seasonWinner>;
    state.seasonEndDismissed = false;
    expect(isMapUnobstructed(state)).toBe(false);
    state.seasonEndDismissed = true;
    expect(isMapUnobstructed(state)).toBe(true);
  });
});
