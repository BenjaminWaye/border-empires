// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ownershipHelpSubtitleHtml } from "../client-tile-menu-ownership-help/client-tile-menu-ownership-help.js";
import { createInitialState } from "../client-state/client-state.js";
import type { TileMenuView } from "../client-types.js";
import { dockTileActionMenuForHudV2, setDockListener, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

const view = (title: string): TileMenuView =>
  ({
    title, subtitle: "Your frontier", subtitleHtml: ownershipHelpSubtitleHtml("frontier", "Your frontier"),
    tabs: [], overviewLines: [], actions: [], buildings: [], crystal: []
  }) as unknown as TileMenuView;

describe("docked tile panel", () => {
  // Regression: "Your frontier" opened its explainer, then the next repaint of the panel shut it again.
  it("keeps the ownership explainer open while the same tile repaints", () => {
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "102,174";
    const deps: TileDockDeps = {
      tileActionMenuEl: document.getElementById("tile-action-menu") as HTMLElement,
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

  // Regression: the status chip opens only its explainer, and a stale "status" panel must not reopen by itself
  // when a later status on the same tile has help again (e.g. hold → captured → beyond reach).
  it("toggles the status explainer from the chip and drops it once the status has no help", async () => {
    // The dock is a module singleton wired to the first test's (now detached) bar: start from a fresh module.
    vi.resetModules();
    const { dockTileActionMenuForHudV2 } = await import("./client-hud-v2-tile-dock.js");
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "16,15";
    const deps: TileDockDeps = {
      tileActionMenuEl: document.getElementById("tile-action-menu") as HTMLElement,
      handleTileAction: () => undefined,
      hideTileActionMenu: () => undefined,
      renderHud: () => undefined
    };
    const withStatus = (statusText: string, statusHelpText?: string): TileMenuView =>
      ({ ...view("Sand (16, 15)"), statusText, statusTone: "warning", ...(statusHelpText ? { statusHelpText } : {}), overviewLines: [{ html: "Hills: vision +1", kind: "effect" }] }) as TileMenuView;
    const popup = (): Element | null => document.querySelector("#hud-v2-tile .hud-v2-status-help");
    dockTileActionMenuForHudV2(state, withStatus("Inside Maren Reach", "Can't garrison inside another empire's reach."), deps, () => undefined);
    document.querySelector<HTMLButtonElement>('#hud-v2-tile [data-hud-v2-panel="status"]')!.click();
    expect(popup()?.textContent).toContain("Can't garrison inside another empire's reach.");
    expect(document.querySelector("#hud-v2-tile")!.textContent).not.toContain("Hills: vision +1");
    dockTileActionMenuForHudV2(state, withStatus("Recently captured 2m"), deps, () => undefined);
    expect(popup()).toBeNull();
    dockTileActionMenuForHudV2(state, withStatus("Beyond your reach", "Your reach is the land within 3 tiles of your towns."), deps, () => undefined);
    expect(popup()).toBeNull();
  });

  // Regression: tap tracking was installed with the dock on the first menu render, after that render's own
  // pointer-up, so the first tap of a session never counted (a flagged town needed three taps).
  it("counts the very first map tap of a session", () => {
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
    const { dockTileActionMenuForHudV2, setDockListener } = await import("./client-hud-v2-tile-dock.js");
    document.body.innerHTML = `<canvas id="game"></canvas><div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const hidden: (number | undefined)[] = [];
    const presses: (number | undefined)[] = [];
    setDockListener({ onMenuView: (_view, _key, tapPress) => { presses.push(tapPress); return false; }, onMenuHidden: (byMapPress) => hidden.push(byMapPress), onBarAction: () => undefined });
    const menu = document.getElementById("tile-action-menu") as HTMLElement;
    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "5,5";
    const deps: TileDockDeps = { tileActionMenuEl: menu, handleTileAction: () => undefined, hideTileActionMenu: () => undefined, renderHud: () => undefined };
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

  it("opens Modules for each tap on an AFC arm, but not when the AFC itself is tapped", async () => {
    vi.resetModules();
    const { dockTileActionMenuForHudV2 } = await import("./client-hud-v2-tile-dock.js");
    document.body.innerHTML = `<div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    const state = createInitialState();
    state.me = "me";
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "20,20";
    state.tiles.set("20,20", { x: 20, y: 20, terrain: "LAND", ownerId: "me", afc: { ownerId: "me", status: "active", modules: [] } });
    const deps: TileDockDeps = {
      tileActionMenuEl: document.getElementById("tile-action-menu") as HTMLElement,
      handleTileAction: () => undefined,
      hideTileActionMenu: () => undefined,
      renderHud: () => undefined
    };
    const afcView = { ...view("AFC (20, 20)"), tabs: ["modules"], modules: { owned: true, active: true, slots: [], actions: [] } } as unknown as TileMenuView;
    const side = (): HTMLElement => document.getElementById("hud-v2-build")!;
    dockTileActionMenuForHudV2(state, afcView, deps, () => undefined);
    expect(side().hidden).toBe(true);
    state.tileActionMenu.afcArmFocus = { socket: 2, seq: 1 };
    dockTileActionMenuForHudV2(state, afcView, deps, () => undefined);
    expect(side().hidden).toBe(false);
    expect(side().dataset.view).toBe("modules");
    document.querySelector<HTMLButtonElement>("#hud-v2-build [data-hud-v2-panel-close]")!.click();
    expect(side().hidden).toBe(true);
    dockTileActionMenuForHudV2(state, afcView, deps, () => undefined); // a repaint keeps it closed
    expect(side().hidden).toBe(true);
    state.tileActionMenu.afcArmFocus = { socket: 2, seq: 2 }; // the same arm tapped again
    dockTileActionMenuForHudV2(state, afcView, deps, () => undefined);
    expect(side().hidden).toBe(false);
    document.querySelector<HTMLButtonElement>("#hud-v2-build [data-hud-v2-panel-close]")!.click();
    // A paint before the Modules tab exists (detail still loading) must not use up the tap.
    state.tileActionMenu.afcArmFocus = { socket: 3, seq: 3 };
    dockTileActionMenuForHudV2(state, { ...afcView, tabs: [] } as TileMenuView, deps, () => undefined);
    expect(side().hidden).toBe(true);
    dockTileActionMenuForHudV2(state, afcView, deps, () => undefined);
    expect(side().hidden).toBe(false);
  });
});
