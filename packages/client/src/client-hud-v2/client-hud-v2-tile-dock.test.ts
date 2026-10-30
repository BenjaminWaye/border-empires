// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ownershipHelpSubtitleHtml } from "../client-tile-menu-ownership-help/client-tile-menu-ownership-help.js";
import { createInitialState } from "../client-state/client-state.js";
import type { TileMenuView } from "../client-types.js";
import { initHudV2Flag } from "./client-hud-v2-flag.js";
import { dockTileActionMenuForHudV2, setDockListener, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

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

  // Regression: tap tracking was installed with the dock on the first menu render, after that render's own
  // pointer-up, so the first tap of a session never counted (a flagged town needed three taps).
  it("counts the very first map tap of a session", () => {
    initHudV2Flag("?hud=v2");
    document.body.innerHTML = `<canvas id="game"></canvas><div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const taps: boolean[] = [];
    setDockListener({ onMenuView: (_view, _key, tapPress) => { taps.push(tapPress !== undefined); return false; }, onMenuHidden: () => undefined, onBarAction: () => undefined });
    const game = document.getElementById("game") as HTMLElement;
    game.dispatchEvent(new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }));
    game.dispatchEvent(new PointerEvent("pointerup", { clientX: 51, clientY: 50, bubbles: true }));
    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "5,5";
    const deps: TileDockDeps = {
      tileActionMenuEl: document.getElementById("tile-action-menu") as HTMLElement,
      isMobile: () => false,
      handleTileAction: () => undefined,
      hideTileActionMenu: () => undefined,
      renderHud: () => undefined
    };
    dockTileActionMenuForHudV2(state, view("Town (5, 5)"), deps, () => undefined);
    dockTileActionMenuForHudV2(state, view("Town (5, 5)"), deps, () => undefined);
    expect(taps).toEqual([true, false]);
  });

  // Regression (review): the town screen relied on a 700 ms timer to tell "the map press that re-taps the
  // flagged tile" from "the player closed the bar". The dock now reports which press hid the menu.
  it("reports the map press that hid the menu, and the same press on the tap that follows", async () => {
    // A fresh module: the dock (and the menu it watches) is created once per page, by the first render.
    vi.resetModules();
    const { initHudV2Flag } = await import("./client-hud-v2-flag.js");
    const { dockTileActionMenuForHudV2, setDockListener } = await import("./client-hud-v2-tile-dock.js");
    initHudV2Flag("?hud=v2");
    document.body.innerHTML = `<canvas id="game"></canvas><div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const hidden: (number | undefined)[] = [];
    const presses: (number | undefined)[] = [];
    setDockListener({ onMenuView: (_view, _key, tapPress) => { presses.push(tapPress); return false; }, onMenuHidden: (byMapPress) => hidden.push(byMapPress), onBarAction: () => undefined });
    const menu = document.getElementById("tile-action-menu") as HTMLElement;
    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "5,5";
    const deps: TileDockDeps = { tileActionMenuEl: menu, isMobile: () => false, handleTileAction: () => undefined, hideTileActionMenu: () => undefined, renderHud: () => undefined };
    dockTileActionMenuForHudV2(state, view("Town (5, 5)"), deps, () => undefined);
    const game = document.getElementById("game") as HTMLElement;
    // A press on the map: the map hides the menu on mousedown, the tap reopens it on mouseup.
    game.dispatchEvent(new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }));
    menu.style.display = "none";
    await new Promise((resolve) => setTimeout(resolve, 0));
    game.dispatchEvent(new PointerEvent("pointerup", { clientX: 50, clientY: 50, bubbles: true }));
    menu.style.display = "";
    dockTileActionMenuForHudV2(state, view("Town (5, 5)"), deps, () => undefined);
    // Closed with ✕ or Esc: no map press in progress.
    menu.style.display = "none";
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hidden[0]).toBeTypeOf("number");
    expect(presses.at(-1)).toBe(hidden[0]);
    expect(hidden[1]).toBeUndefined();
  });
});
