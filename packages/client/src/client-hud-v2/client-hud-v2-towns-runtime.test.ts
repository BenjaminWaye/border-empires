// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { townListSort } from "../client-town-list/client-town-list.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { screen, SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { closeScreen, openScreen, screenClick } from "./client-hud-v2-screens.js";
import { closeTownScreen, forgetMyTowns, townOnMenuView } from "./client-hud-v2-town-runtime.js";

const view: TileMenuView = { title: "Town", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] };
const town = (x: number, name: string, goldPerMinute: number, extra: Partial<Tile> = {}): Tile => ({
  x, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "full",
  town: {
    name, type: "FARMING", terrainProfile: "GRASS", coastal: false, populationTier: "TOWN",
    population: 25000, maxPopulation: 100000, populationGrowthPerMinute: 10,
    baseGoldPerMinute: goldPerMinute, goldPerMinute, cap: 0, supportCurrent: 0, supportMax: 8, isFed: true,
    connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false,
    hasIncubationEngine: false, incubationEngineActive: false
  },
  ...extra
});

const setup = () => {
  document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
  forgetMyTowns();
  const state = createInitialState();
  state.me = "me";
  state.tiles.set("5,5", town(5, "Alder", 1));
  // A town with your muster flag on it: a map press needs a second tap to open its screen.
  state.tiles.set("20,5", town(20, "Birch", 3, { muster: { ownerId: "me", amount: 10, mode: "HOLD", updatedAt: 0 } }));
  const openSingleTileActionMenu = vi.fn((tile: Tile) => { townOnMenuView(deps, view, `${tile.x},${tile.y}`); });
  const deps: HudV2Deps = {
    state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x) => x, wrapY: (y) => y,
    setActivePanel: vi.fn(), sendGameMessage: () => true, ownerColor: () => "#888",
    actionFlow: {
      chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
      requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: () => view, openSingleTileActionMenu
    }
  };
  closeScreen(deps, { toMap: true }); // a previous test may have left a screen open
  openScreen(deps, "towns");
  const row = (key: string): HTMLElement => document.querySelector<HTMLElement>(`[data-v2-towns-open="${key}"]`)!;
  return { state, deps, row, openSingleTileActionMenu };
};

describe("HUD v2 Towns screen", () => {
  afterEach(() => {
    closeTownScreen();
    document.body.innerHTML = "";
  });

  it("opens the town screen for a town with a muster flag on it", () => {
    const { deps, state, row } = setup();
    expect(screen.id).toBe("towns");
    screenClick(deps, row("20,5"));
    expect(screen.id).toBe("town");
    expect(state.camX).toBe(20);
  });

  it("still needs the second tap when the flagged town is pressed on the map", () => {
    const { deps } = setup();
    closeScreen(deps);
    townOnMenuView(deps, view, "20,5", 1);
    expect(screen.id).toBeNull();
  });

  it("keeps the list open when a row's town is no longer yours", () => {
    const { deps, state, row, openSingleTileActionMenu } = setup();
    state.tiles.set("5,5", { ...town(5, "Alder", 1), ownerId: "rival" });
    screenClick(deps, row("5,5"));
    expect(screen.id).toBe("towns");
    expect(openSingleTileActionMenu).not.toHaveBeenCalled();
    expect(document.querySelector('[data-v2-towns-open="5,5"]')).toBeNull();
  });

  it("re-sorts on a header press and keeps the list's scroll position", () => {
    const { deps } = setup();
    const before = townListSort();
    screenClick(deps, document.querySelector<HTMLElement>(`[data-v2-towns-sort="${before.key}"]`)!);
    expect(townListSort()).toEqual({ key: before.key, descending: !before.descending });
    expect(document.querySelector(".v2l-table")?.getAttribute("data-v2-scroll")).toBe("towns");
  });
});
