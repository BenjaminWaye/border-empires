// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { refreshOnboardingChecklistHighlight } from "../client-onboarding-checklist/client-onboarding-checklist-refresh.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { AFC_JOIN_DROP_DWELL_MS, AFC_JOIN_TOTAL_MS } from "./client-afc-join-drop-timeline.js";
import { tickAfcJoinDropForFrame } from "./client-afc-join-drop-frame.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const viewport = { canvasWidth: 1000, canvasHeight: 800, tilePx: 40 };
const panelHidden = (): boolean | undefined => document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden");

const joinedState = (withAfc: boolean) => {
  const state = createInitialState();
  state.me = "p1";
  state.authEmail = "a@example.com";
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.guide.open = false;
  state.connection = "initialized";
  state.firstChunkAt = 1;
  state.camX = 10;
  state.camY = 10;
  if (withAfc) state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "p1", afc: { ownerId: "p1", status: "active", activatedAt: Date.now() - 1000 } } as Tile);
  else state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "p1" } as Tile);
  state.tilesRevision += 1;
  return state;
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  resetOnboardingChecklistOverlayForTests();
});

describe("onboarding checklist vs the join-time AFC drop", () => {
  it("holds the checklist's auto-open until the drop is done, then opens it once", () => {
    const state = joinedState(true);
    // The snapshot handler renders the checklist before the tick has scanned for a fresh AFC.
    refreshOnboardingChecklistHighlight(state);
    expect(panelHidden()).toBe(true);

    // Arms (waiting) -- still held.
    tickAfcJoinDropForFrame(state, 0, viewport, keyFor);
    expect(state.afcJoinDrop.phase).toBe("waiting");
    refreshOnboardingChecklistHighlight(state);
    expect(panelHidden()).toBe(true);

    // Gate open through the dwell -> playing -> still held.
    tickAfcJoinDropForFrame(state, 10, viewport, keyFor);
    tickAfcJoinDropForFrame(state, 10 + AFC_JOIN_DROP_DWELL_MS, viewport, keyFor);
    expect(state.afcJoinDrop.phase).toBe("playing");
    refreshOnboardingChecklistHighlight(state);
    expect(panelHidden()).toBe(true);

    // Drop finishes -> the tick itself performs the deferred auto-open, no tile delta needed.
    tickAfcJoinDropForFrame(state, 10 + AFC_JOIN_DROP_DWELL_MS + AFC_JOIN_TOTAL_MS, viewport, keyFor);
    expect(state.afcJoinDrop.phase).toBe("done");
    expect(panelHidden()).toBe(false);
  });

  it("opens the checklist as soon as the first scan finds no drop to play", () => {
    const state = joinedState(false);
    refreshOnboardingChecklistHighlight(state);
    expect(panelHidden()).toBe(true);
    tickAfcJoinDropForFrame(state, 0, viewport, keyFor);
    expect(state.afcJoinDrop.phase).toBe("idle");
    expect(panelHidden()).toBe(false);
  });

  it("does not re-render the checklist on later idle ticks once nothing is deferred", () => {
    const state = joinedState(false);
    refreshOnboardingChecklistHighlight(state);
    tickAfcJoinDropForFrame(state, 0, viewport, keyFor);
    const bubble = document.getElementById("onboarding-checklist-bubble");
    state.tilesRevision += 1; // a tile delta lands: idle + unscanned -> transient hold
    tickAfcJoinDropForFrame(state, 1000, viewport, keyFor);
    expect(document.getElementById("onboarding-checklist-bubble")).toBe(bubble);
  });
});
