// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ownershipHelpSubtitleHtml } from "../client-tile-menu-ownership-help/client-tile-menu-ownership-help.js";
import { createInitialState } from "../client-state/client-state.js";
import type { TileMenuView } from "../client-types.js";
import { initHudV2Flag } from "./client-hud-v2-flag.js";
import { dockTileActionMenuForHudV2, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

const view = (title: string): TileMenuView =>
  ({
    title, subtitle: "Your frontier", subtitleHtml: ownershipHelpSubtitleHtml("frontier", "Your frontier"),
    tabs: [], overviewLines: [], actions: [], buildings: [], crystal: []
  }) as unknown as TileMenuView;

describe("docked tile panel", () => {
  // Regression: "Your frontier" opened its explainer, then the next repaint of the panel shut it again.
  it("keeps the ownership explainer open while the same tile repaints", () => {
    initHudV2Flag("?hud=v2");
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "102,174";
    const deps: TileDockDeps = {
      tileActionMenuEl: document.getElementById("tile-action-menu") as HTMLElement,
      isMobile: () => false,
      handleTileAction: () => undefined,
      hideTileActionMenu: () => undefined,
      renderHud: () => undefined
    };
    dockTileActionMenuForHudV2(state, view("Grassland (102, 174)"), deps, () => undefined);
    const help = (): HTMLDetailsElement | null => document.querySelector("#hud-v2-tile details.tile-ownership-help");
    help()?.setAttribute("open", "");
    dockTileActionMenuForHudV2(state, view("Grassland (102, 174) "), deps, () => undefined);
    expect(help()?.open).toBe(true);
    state.tileActionMenu.currentTileKey = "103,174";
    dockTileActionMenuForHudV2(state, view("Grassland (103, 174)"), deps, () => undefined);
    expect(help()?.open).toBe(false);
  });
});
