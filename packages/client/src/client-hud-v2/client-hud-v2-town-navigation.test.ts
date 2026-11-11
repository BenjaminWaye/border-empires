// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";
import { screen, SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { closeTownScreen, renderTownScreen, stepTown, townOnMenuView, townOnMenuHidden } from "./client-hud-v2-town-runtime.js";

import { screenClick } from "./client-hud-v2-screens.js";

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
      setActivePanel: vi.fn(), sendGameMessage: () => true, ownerColor: () => "#888",
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
    expect(panel?.textContent).toContain("Support 7/8");
    stepTown(deps, -1);
    expect(requestTileDetailIfNeeded).toHaveBeenLastCalledWith(first, { force: true });
    stepTown(deps, 1);
    // The short-lived town list still holds the old record; navigation must use the latest tile.
    expect(requestTileDetailIfNeeded).toHaveBeenLastCalledWith(updated, { force: true });
  });
  it("keeps the building selected after a support build and honors the next explicit tile pick", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "me";
    const hub = town(5, "Alder");
    const first: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
    const second: Tile = { ...first, x: 6, y: 6 };
    const automatic: Tile = { ...first, x: 4 };
    for (const tile of [hub, first, second, automatic]) state.tiles.set(`${tile.x},${tile.y}`, tile);
    const buildView: TileMenuView = { ...view, buildings: [{ id: "build_manufactory", label: "Manufactory" }] };
    const sent: string[] = [];
    const deps: HudV2Deps = {
      state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x) => x, wrapY: (y) => y,
      setActivePanel: vi.fn(), sendGameMessage: () => true, ownerColor: () => "#888",
      actionFlow: {
        chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), hideTileActionMenu: vi.fn(), requestTileDetailIfNeeded: vi.fn(),
        tileMenuViewForTile: () => buildView,
        openSingleTileActionMenu: (tile) => {
          state.tileActionMenu.mode = "single";
          state.tileActionMenu.visible = true;
          state.tileActionMenu.currentTileKey = `${tile.x},${tile.y}`;
          townOnMenuView(deps, buildView, state.tileActionMenu.currentTileKey);
        },
        handleTileAction: () => {
          const key = state.tileActionMenu.currentTileKey;
          const tile = state.tiles.get(key)!;
          if (queueDevelopmentAction(state, { kind: "BUILD", tileKey: key, x: tile.x, y: tile.y,
            label: "Manufactory", optimisticKind: "MANUFACTORY", payload: { type: "BUILD_STRUCTURE", x: tile.x, y: tile.y, structureType: "MANUFACTORY" } },
            { renderHud: vi.fn(), pushFeed: vi.fn() })) sent.push(key);
          state.tileActionMenu.visible = false;
          townOnMenuHidden(undefined);
        }
      }
    };
    const pick = (tile: Tile) => {
      deps.actionFlow.openSingleTileActionMenu(tile, 0, 0);
      screenClick(deps, document.querySelector<HTMLElement>('[data-v2-build-pick="build_manufactory"]')!);
    };
    const place = () => screenClick(deps, document.querySelector<HTMLElement>('[data-hud-v2-action="build_manufactory"]')!);
    pick(first);
    place();
    expect(screen.id).toBe("town");
    expect(screen.townBuildSelection).toBe("build_manufactory");
    expect(state.tileActionMenu.visible).toBe(true);
    place();
    deps.actionFlow.openSingleTileActionMenu(second, 0, 0);
    expect(screen.townBuildSelection).toBe("build_manufactory");
    place();
    expect(sent).toEqual(["6,5", "4,5", "6,6"]);
    expect(screen.townBuildSelection).toBe("build_manufactory");
    expect(state.developmentQueue.map((entry) => entry.tileKey)).toEqual(sent);
  });

  it.each([
    ["FARM", "build_hydrogarden"], ["TITANIUM", "build_mine"], ["UMBRITE", "build_umbrite_rig"]
  ] as const)("offers the yellow improvement on a %s in the town support ring", (resource, id) => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "me";
    const hub = town(5, "Alder");
    const farm: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource };
    state.tiles.set("5,5", hub);
    state.tiles.set("6,5", farm);
    const improvement: TileActionDef = { id, label: `Build ${resource}`, cost: "100 coin" };
    const focusView: TileMenuView = { ...view, buildings: [
      { id: "build_fortification", label: "Fort" }, improvement,
      { id: "build_relay_beacon", label: "Relay Beacon" }
    ] };
    const handleTileAction = vi.fn();
    const deps: HudV2Deps = {
      state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: x => x, wrapY: y => y,
      setActivePanel: vi.fn(), sendGameMessage: () => true, ownerColor: () => "#888",
      actionFlow: { chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction,
        hideTileActionMenu: vi.fn(), requestTileDetailIfNeeded: vi.fn(),
        tileMenuViewForTile: tile => tile === hub ? view : focusView, openSingleTileActionMenu: vi.fn() }
    };
    expect(townOnMenuView(deps, focusView, "6,5")).toBe(true);
    const primary = () => document.querySelector<HTMLButtonElement>("#v2t-bar .v2t-act-primary");
    expect(primary()?.dataset.hudV2Action).toBe(id);
    expect(primary()?.dataset.targetKey).toBe("6,5");
    expect(document.querySelector('[data-v2-build-category][aria-selected="true"]')?.getAttribute("data-v2-build-category")).toBe("resource");
    screenClick(deps, primary()!);
    expect(handleTileAction).toHaveBeenCalledWith(id, "6,5", undefined, false);

    // A manually chosen category persists on ticks, but not when selecting a different plot.
    screenClick(deps, document.querySelector<HTMLElement>('[data-v2-build-category="military"]')!);
    renderTownScreen(deps);
    expect(screen.townCategory).toBe("military");
    townOnMenuView(deps, view, "5,5");
    townOnMenuView(deps, focusView, "6,5");
    expect(document.querySelector('[data-v2-build-category][aria-selected="true"]')?.getAttribute("data-v2-build-category")).toBe("resource");

    improvement.disabled = true;
    improvement.disabledReason = "Need 100 coin";
    townOnMenuView(deps, focusView, "6,5");
    expect(primary()).toBeNull();
    improvement.disabled = false;
    const garrison: TileActionDef = { id: "settle_land", label: "Garrison", recommended: true };
    townOnMenuView(deps, { ...focusView, actions: [garrison] }, "6,5");
    expect(primary()?.dataset.hudV2Action).toBe("settle_land");
  });

});
