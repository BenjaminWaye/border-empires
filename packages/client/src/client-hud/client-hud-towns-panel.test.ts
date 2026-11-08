// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { renderHudTownsPanel } from "./client-hud-towns-panel.js";

const town = (x: number, name: string, goldPerMinute: number): Tile => ({
  x,
  y: 7,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  town: {
    name,
    type: "MARKET",
    baseGoldPerMinute: goldPerMinute,
    supportCurrent: 0,
    supportMax: 0,
    goldPerMinute,
    cap: 0,
    isFed: true,
    population: 4000,
    maxPopulation: 8000,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasManufactory: false,
    manufactoryActive: false,
    hasIncubationEngine: false,
    incubationEngineActive: false
  }
});

const setup = (open = true) => {
  const state = createInitialState();
  state.me = "me";
  if (open) {
    state.activePanel = "towns";
  }
  state.tiles.set("2,7", town(2, "Ashford", 1));
  state.tiles.set("9,7", town(9, "Brimvale", 3));
  const root = document.createElement("div");
  const panelEl = document.createElement("section");
  root.append(panelEl);
  const requestViewRefresh = vi.fn();
  const rerender = vi.fn();
  renderHudTownsPanel(state, {
    root, panelEl, rerender, requestViewRefresh,
    wrapX: (x) => x,
    wrapY: (y) => y,
    safeHtml: (_label, _fallback, render) => render(),
    fallbackHtml: ""
  });
  return { state, panelEl, requestViewRefresh };
};

describe("renderHudTownsPanel", () => {
  it("fills the Towns panel", () => {
    const { panelEl } = setup();
    expect(panelEl.textContent).toContain("2 towns");
  });

  it("skips building the list while the Towns panel is closed", () => {
    const { panelEl } = setup(false);
    expect(panelEl.innerHTML).toBe("");
  });

  it("jumps the camera to a town", () => {
    const { state, panelEl, requestViewRefresh } = setup();
    panelEl.querySelector<HTMLButtonElement>('[data-town-list-jump="9,7"]')?.click();
    expect(state.camX).toBe(9);
    expect(state.camY).toBe(7);
    expect(state.selected).toEqual({ x: 9, y: 7 });
    expect(requestViewRefresh).toHaveBeenCalled();
  });
});
