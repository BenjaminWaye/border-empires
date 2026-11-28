// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { dropCloseUp, isCloseUp } from "./client-hud-v2-camera.js";
import { closeTownScreen, townOnMenuHidden, townOnMenuView } from "./client-hud-v2-town-runtime.js";

const view: TileMenuView = { title: "Grain", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] };
const hub: Tile = {
  x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "full",
  town: {
    name: "Alder", type: "FARMING", terrainProfile: "GRASS", coastal: false, populationTier: "TOWN",
    population: 25000, maxPopulation: 100000, populationGrowthPerMinute: 10,
    baseGoldPerMinute: 0, goldPerMinute: 0, cap: 0, supportCurrent: 0, supportMax: 8, isFed: true,
    connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false,
    hasIncubationEngine: false, incubationEngineActive: false
  }
};
const grain: Tile = { x: 6, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FARM" };

const setup = () => {
  document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
  document.body.classList.add("hud-v2-compact");
  const state = createInitialState();
  state.me = "me";
  for (const tile of [hub, grain]) state.tiles.set(`${tile.x},${tile.y}`, tile);
  Object.assign(state, { camX: 20, camY: 21, zoom: 30 });
  const deps = {
    state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x: number) => x, wrapY: (y: number) => y,
    setActivePanel: vi.fn(), sendGameMessage: () => true, ownerColor: () => "#888",
    actionFlow: { chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), hideTileActionMenu: vi.fn(), requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: () => view, openSingleTileActionMenu: vi.fn(), handleTileAction: vi.fn() }
  } as unknown as HudV2Deps;
  return { deps, state };
};

// First-15 playtest 2026-11-28 (pt-citybuilder): garrisoning grain plots one by one, every tap jumped the
// camera to the town (the town screen's close-up) and every Garrison glided it back.
describe("tapping a town's support tile", () => {
  afterEach(() => {
    closeTownScreen();
    dropCloseUp();
    document.body.className = "";
    document.body.innerHTML = "";
  });

  it("opens the town screen without moving the camera, and closing it after Garrison leaves the view", () => {
    const { deps, state } = setup();
    expect(townOnMenuView(deps, view, "6,6", 1)).toBe(true);
    expect([state.camX, state.camY, state.zoom]).toEqual([20, 21, 30]);
    expect(isCloseUp()).toBe(false);
    townOnMenuHidden(undefined);
    expect([state.camX, state.camY, state.zoom]).toEqual([20, 21, 30]);
  });

  it("still closes in on the town when the town itself is tapped", () => {
    const { deps, state } = setup();
    expect(townOnMenuView(deps, view, "5,5", 1)).toBe(true);
    expect([state.camX, state.camY]).toEqual([5, 5]);
    expect(isCloseUp()).toBe(true);
  });
});
