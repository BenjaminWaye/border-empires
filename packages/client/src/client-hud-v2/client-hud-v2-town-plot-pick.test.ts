// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { queueDevelopmentAction } from "../client-development-queue/client-development-queue.js";
import { refineryPickerHighlight } from "../client-refineries/refinery-picker-highlight.js";
import { createInitialState } from "../client-state/client-state.js";
import { handleTownPlotPlacementTap, TOWN_PLOT_PICK_BODY_CLASS, townPlotPlacement } from "../client-town-plot-placement/client-town-plot-placement.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { screen, SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { screenClick, screenEscape } from "./client-hud-v2-screens.js";
import { closeTownScreen, townOnMenuHidden, townOnMenuView } from "./client-hud-v2-town-runtime.js";

const view: TileMenuView = { title: "Alder", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] };
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
const plot = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });

const setup = (compact: boolean) => {
  document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
  document.body.classList.toggle("hud-v2-compact", compact);
  const state = createInitialState();
  state.me = "me";
  for (const tile of [hub, plot(6, 5), plot(6, 6), plot(4, 5)]) state.tiles.set(`${tile.x},${tile.y}`, tile);
  const buildView: TileMenuView = { ...view, buildings: [{ id: "build_manufactory", label: "Build Manufactory", cost: "300 coin" }] };
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
  deps.actionFlow.openSingleTileActionMenu(hub, 0, 0);
  const click = (selector: string) => screenClick(deps, document.querySelector<HTMLElement>(selector)!);
  return { deps, state, sent, click };
};

const ROW = '[data-v2-build-pick="build_manufactory"]';
const picking = (): boolean => document.body.classList.contains(TOWN_PLOT_PICK_BODY_CLASS);

describe("phone town plot pick", () => {
  afterEach(() => {
    closeTownScreen();
    document.body.className = "";
    document.body.innerHTML = "";
  });

  it("moves building onto the map: the row starts a pick, a tap moves it, Build here builds there", () => {
    const { sent, click } = setup(true);
    click(ROW);
    expect(sent).toEqual([]);
    expect(picking()).toBe(true);
    const first = townPlotPlacement();
    expect(first?.candidates).toHaveLength(3);
    expect(document.getElementById("v2t-pick")?.textContent).toContain("Build Manufactory");
    // Every open plot glows; the chosen one stands out (drawn by both renderers from this slot).
    expect(refineryPickerHighlight()?.get(first!.chosenKey)).toBe("site");
    expect([...refineryPickerHighlight()!.values()].filter((tone) => tone === "eligible")).toHaveLength(2);

    expect(handleTownPlotPlacementTap(6, 6)).toBe(true);
    expect(townPlotPlacement()?.chosenKey).toBe("6,6");
    expect(document.getElementById("v2t-pick")?.textContent).toContain("Plot (6, 6)");
    // A tap off the plots keeps the choice and says where to tap; it never selects the tile behind.
    expect(handleTownPlotPlacementTap(9, 9)).toBe(true);
    expect(townPlotPlacement()?.chosenKey).toBe("6,6");
    expect(document.querySelector("#v2t-pick .v2t-warn")?.textContent).toContain("Tap a glowing plot");

    click('[data-v2-plot-pick="confirm"]');
    expect(sent).toEqual(["6,6"]);
    expect(townPlotPlacement()).toBeUndefined();
    expect(picking()).toBe(false);
    expect(refineryPickerHighlight()).toBeUndefined();
    expect(screen.id).toBe("town");
    expect(screen.townBuildSelection).toBe("build_manufactory");

    // "Place another" opens the next pick, without the plot just taken.
    click('#v2t-build [data-hud-v2-action="build_manufactory"]');
    expect(sent).toEqual(["6,6"]);
    expect(townPlotPlacement()?.candidates).not.toContain("6,6");
  });

  it("cancels back to the town screen with nothing built, by Cancel or Esc", () => {
    const { deps, sent, click } = setup(true);
    click(ROW);
    click('[data-v2-plot-pick="cancel"]');
    expect(townPlotPlacement()).toBeUndefined();
    expect(picking()).toBe(false);
    expect(screen.id).toBe("town");
    click(ROW);
    expect(screenEscape(deps)).toBe(true);
    expect(townPlotPlacement()).toBeUndefined();
    expect(screen.id).toBe("town");
    expect(sent).toEqual([]);
  });

  it("ends the pick when the town screen closes, so map taps select again", () => {
    const { click } = setup(true);
    click(ROW);
    closeTownScreen();
    expect(townPlotPlacement()).toBeUndefined();
    expect(handleTownPlotPlacementTap(6, 6)).toBe(false);
  });

  it("keeps the list and Place on desktop, where the map stays visible", () => {
    const { sent, click } = setup(false);
    click(ROW);
    expect(townPlotPlacement()).toBeUndefined();
    expect(screen.townBuildSelection).toBe("build_manufactory");
    click('#v2t-build [data-hud-v2-action="build_manufactory"]');
    expect(sent).toHaveLength(1);
  });
});
