// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileActionDef, TileMenuView } from "../client-types.js";
import { dockTileActionMenuForHudV2, setDockListener, type TileDockDeps } from "./client-hud-v2-tile-dock.js";

// Regression (2026-11-18 playtest): select first, then confirm (client-tile-interaction.ts) only
// selected the tile, but the docked bar's own "click claims adjacent neutral land" shortcut then sent
// Expand To as soon as the sheet opened, so the first tap still spent manpower.
describe("docked tile bar on neutral land next to yours", () => {
  it("shows Expand To without sending it when a map tap opens the sheet", () => {
    document.body.innerHTML = `<canvas id="game"></canvas><div id="tile-action-menu"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>`;
    setDockListener({ onMenuView: () => false, onMenuHidden: () => undefined, onBarAction: () => undefined });
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("4,5", { x: 4, y: 5, terrain: "LAND", ownerId: "me" });
    state.tiles.set("5,5", { x: 5, y: 5, terrain: "LAND" });
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "5,5";
    const handleTileAction = vi.fn();
    const deps: TileDockDeps = {
      tileActionMenuEl: document.getElementById("tile-action-menu") as HTMLElement,
      handleTileAction,
      hideTileActionMenu: () => undefined,
      renderHud: () => undefined
    };
    const expand = { id: "settle_land", label: "Expand To", cost: "1 coin · 10 manpower" } as TileActionDef;
    const view = { title: "Grassland (5, 5)", subtitle: "Neutral", tabs: [], overviewLines: [], actions: [expand], buildings: [], crystal: [] } as unknown as TileMenuView;
    const game = document.getElementById("game") as HTMLElement;
    game.dispatchEvent(new PointerEvent("pointerdown", { clientX: 50, clientY: 50, bubbles: true }));
    game.dispatchEvent(new PointerEvent("pointerup", { clientX: 50, clientY: 50, bubbles: true }));
    dockTileActionMenuForHudV2(state, view, deps, () => undefined);
    expect(handleTileAction).not.toHaveBeenCalled();
    expect(document.getElementById("hud-v2-tile")!.textContent).toContain("Expand To");
  });
});
