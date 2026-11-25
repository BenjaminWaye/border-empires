// @vitest-environment happy-dom
// Playtest Run 5 (Henrik, 375x620): the Explore pill sat on top of open panels, over the victory bars, the tech
// text and the diplomacy card. The pill lives on <body> and #hud is its own stacking context, so its z-index beat
// every panel inside the HUD. It now waits while a screen, side panel or sheet is open.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { screen } from "../client-hud-v2/client-hud-v2-context.js";
import { createHudV2Sheet } from "../client-hud-v2/client-hud-v2-sheet.js";
import { renderScoutDroneHud } from "./client-scout-drone-hud.js";

const baseState = () => {
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  state.mapPrep = null;
  state.changelog.open = false;
  state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active" } } as Tile);
  return state;
};
const deps = () => ({ send: vi.fn(() => true), rerender: vi.fn(), focus: vi.fn(), now: () => 1_000 });
const pillShown = (): boolean => document.getElementById("scout-drone-pill")?.style.display === "flex";

describe("Explore pill never covers an open panel", () => {
  afterEach(() => {
    screen.id = null;
  });

  it("shows on the bare map", () => {
    renderScoutDroneHud(baseState(), deps());
    expect(pillShown()).toBe(true);
  });

  it.each(["manifest", "diplomacy", "ranks", "chronicle"] as const)("hides while the %s screen is open, and comes back when it closes", (id) => {
    const state = baseState();
    screen.id = id;
    renderScoutDroneHud(state, deps());
    expect(pillShown()).toBe(false);
    screen.id = null;
    renderScoutDroneHud(state, deps());
    expect(pillShown()).toBe(true);
  });

  it("hides while a side panel such as Economy is open", () => {
    const state = baseState();
    state.activePanel = "economy";
    renderScoutDroneHud(state, deps());
    expect(pillShown()).toBe(false);
  });

  it("hides while a sheet such as the Treasury is open", () => {
    const sheet = createHudV2Sheet(document.body, { label: "Treasury", detents: ["half", "full"], initial: "half" });
    try {
      renderScoutDroneHud(baseState(), deps());
      expect(pillShown()).toBe(false);
    } finally {
      sheet.close();
    }
    renderScoutDroneHud(baseState(), deps());
    expect(pillShown()).toBe(true);
  });

  it("holds the landing report back while a panel is open, unseen, until it closes", () => {
    const state = baseState();
    state.scoutDroneReport = { targetX: 2, targetY: 2, towns: 1, docks: 0, waystations: 0, watchtowers: 0, resourceTiles: 0, planetaryDefenseTiles: 0, empiresSighted: [], at: 500, viewed: false };
    screen.id = "manifest";
    renderScoutDroneHud(state, deps());
    expect(document.getElementById("scout-report-card")?.style.display ?? "none").toBe("none");
    expect(state.scoutDroneReport.viewed).toBe(false);
    screen.id = null;
    renderScoutDroneHud(state, deps());
    expect(document.getElementById("scout-report-card")?.style.display).toBe("flex");
  });
});
