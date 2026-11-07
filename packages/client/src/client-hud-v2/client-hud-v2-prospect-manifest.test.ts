// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo, Tile, TileMenuView } from "../client-types.js";
import { tileFeatureLeadLines } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import { clearScreen, screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { openRequestedTechDetail } from "./client-hud-v2-screens.js";
import { dockTileActionMenuForHudV2 } from "./client-hud-v2-tile-dock.js";

afterEach(() => { clearScreen(); document.body.innerHTML = ""; });

it("opens the revealing Manifest when the player follows a prospect clue", () => {
  document.body.innerHTML = '<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside><div id="hud-v2-screen"></div>';
  const state = createInitialState();
  state.me = "me";
  const tech: TechInfo = { id: "titanium-survey", name: "Titanium Survey Crew", tier: 1, branch: "economy", prereqIds: [],
    description: "Reveal Titanium", mods: {}, effects: { revealResource: "titanium" }, requirements: { gold: 0, resources: {} } };
  state.techCatalog = [tech];
  state.techChoices = [tech.id];
  const tile: Tile = { x: 4, y: 4, terrain: "LAND", prospectSignature: "FERROUS_DUST" };
  state.tiles.set("4,4", tile);
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.currentTileKey = "4,4";
  const view: TileMenuView = { title: "Land", subtitle: "Unclaimed", tabs: ["overview"], actions: [], buildings: [], crystal: [],
    overviewLines: tileFeatureLeadLines(tile, "unclaimed", { me: state.me, techCatalog: state.techCatalog,
      prettyToken: value => value, structureInfoButtonHtml: key => key }) };
  const deps: HudV2Deps = {
    state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: x => x, wrapY: y => y, setActivePanel: vi.fn(),
    sendGameMessage: () => true, ownerColor: () => "#888",
    actionFlow: { chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
      requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: () => view, openSingleTileActionMenu: vi.fn() }
  };
  dockTileActionMenuForHudV2(state, view, {
    tileActionMenuEl: document.getElementById("tile-action-menu")!, handleTileAction: deps.actionFlow.handleTileAction, hideTileActionMenu: deps.actionFlow.hideTileActionMenu, renderHud: deps.renderHud
  }, vi.fn());
  document.querySelector<HTMLButtonElement>('[data-hud-v2-panel="details"]')!.click();
  document.querySelector<HTMLButtonElement>('#hud-v2-tile [data-view-tech="titanium-survey"]')!.click();
  openRequestedTechDetail(deps);
  expect(screen.id).toBe("manifest");
  expect(screen.manifestSelectedId).toBe(tech.id);
  expect(document.querySelector('[data-v2-manifest-select="titanium-survey"]')?.getAttribute("aria-pressed")).toBe("true");
  expect(deps.actionFlow.chooseTech).not.toHaveBeenCalled();
});
