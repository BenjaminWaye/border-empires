// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { closeTownScreen, renderTownScreen, stepTown, townOnMenuView } from "./client-hud-v2-town-runtime.js";

const view: TileMenuView = { title: "Town", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] };
const town = (x: number, name: string): Tile => ({
  x, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "full",
  town: {
    name, type: "FARMING", terrainProfile: "GRASS", coastal: false, populationTier: "TOWN",
    population: 25000, maxPopulation: 100000, populationGrowthPerMinute: 10,
    baseGoldPerMinute: 0, goldPerMinute: 0, cap: 0, supportCurrent: 0, supportMax: 8, isFed: true,
    connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false,
    hasIncubationEngine: false, incubationEngineActive: false
  }
});

describe("town arrow detail refresh", () => {
  afterEach(() => {
    closeTownScreen();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("refreshes full-detail towns in either direction and renders the reply without a map click", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T22:00:00Z"));
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "me";
    const first = town(5, "Alder");
    const second = town(20, "Birch");
    state.tiles.set("5,5", first);
    state.tiles.set("20,5", second);
    const requestTileDetailIfNeeded = vi.fn();
    const deps: HudV2Deps = {
      state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x) => x, wrapY: (y) => y,
      isMobile: () => false, sendGameMessage: () => true, ownerColor: () => "#888",
      actionFlow: {
        chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
        requestTileDetailIfNeeded, tileMenuViewForTile: () => view,
        openSingleTileActionMenu: (tile) => { townOnMenuView(deps, view, `${tile.x},${tile.y}`); }
      }
    };
    townOnMenuView(deps, view, "5,5");
    stepTown(deps, 1);
    expect(requestTileDetailIfNeeded).toHaveBeenLastCalledWith(second, { force: true });
    expect(state.selected).toEqual({ x: 20, y: 5 });
    // Model a tile-detail response replacing the summary in the tile store.
    const updated: Tile = { ...second, town: { ...second.town!, goldPerMinute: 2, supportCurrent: 7 } };
    state.tiles.set("20,5", updated);
    renderTownScreen(deps);
    const panel = document.getElementById("v2t-left");
    expect(panel?.textContent).toContain("Birch");
    expect(panel?.textContent).toContain("+2,880/day");
    expect(panel?.textContent).toContain("7 / 8");
    stepTown(deps, -1);
    expect(requestTileDetailIfNeeded).toHaveBeenLastCalledWith(first, { force: true });
    stepTown(deps, 1);
    // The short-lived town list still holds the old record; navigation must use the latest tile.
    expect(requestTileDetailIfNeeded).toHaveBeenLastCalledWith(updated, { force: true });
  });
});
