// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TileMenuView } from "../client-types.js";
import { initHudV2Flag } from "./client-hud-v2-flag.js";
import { renderTileActionMenu } from "../client-tile-action-menu-ui/client-tile-action-menu-ui.js";

const click = (selector: string): void => document.querySelector<HTMLElement>(selector)!.click();

describe("tile progress navigation", () => {
  it("keeps garrison progress inline and forwards rush and cancel to the existing controllers", () => {
    initHudV2Flag("?hud=v2");
    document.body.innerHTML = `<div id="tile-action-menu"><button data-progress-action="rush_buy"></button><button data-progress-action="cancel_settle"></button></div><section id="hud-v2-tile"></section><section id="hud-v2-build" hidden></section>`;
    const menu = document.querySelector<HTMLDivElement>("#tile-action-menu")!;

    const state = createInitialState();
    state.tileActionMenu.mode = "single";
    state.tileActionMenu.currentTileKey = "3,4";
    state.tiles.set("3,4", { x: 3, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" });
    const view: TileMenuView = {
      title: "Plains", subtitle: "Your frontier", tabs: ["actions", "progress"], overviewLines: [], actions: [], buildings: [], crystal: [],
      progress: { title: "Garrison moving in", detail: "", remainingLabel: "3s", progress: 0.7, note: "Troops moving in", rushBuyLabel: "Rush 3", cancelLabel: "Cancel garrison", cancelActionId: "cancel_settle" }
    };
    const sendGameMessage = vi.fn(() => true);
    const clearSettlementProgressByKey = vi.fn();
    const deps: Parameters<typeof renderTileActionMenu>[4] = {
      tileActionMenuEl: menu, isMobile: () => true, handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(), renderHud: vi.fn(),
      viewportSize: () => ({ width: 390, height: 844 }), tileMenuViewForTile: () => view,
      cancelQueuedSettlement: vi.fn(), cancelQueuedBuild: vi.fn(), cancelQueuedAutoSettle: vi.fn(), moveQueuedEntryToFront: vi.fn(),
      cancelQueuedWaypointEntry: vi.fn(), moveWaypointToFront: vi.fn(), cancelQueuedExpandEntry: vi.fn(), moveActionQueueEntryToFront: vi.fn(),
      cancelOngoingCapture: vi.fn(), sendGameMessage, applyOptimisticStructureCancel: vi.fn(), clearSettlementProgressByKey,
      requestAttackPreviewForTarget: vi.fn(), keyFor: (x, y) => `${x},${y}`, isTileOwnedByAlly: () => false
    };
    renderTileActionMenu(state, view, 100, 100, deps);
    expect(menu.querySelector("[data-progress-action]")).toBeNull();
    expect(document.querySelector('[data-hud-v2-tab="progress"]')).toBeNull();
    click('[data-hud-v2-panel="progress"]');
    expect(document.querySelector('[aria-label="Tile progress"]')?.textContent).toContain("Garrison moving in");
    expect(document.querySelector('[aria-label="Tile progress"]')?.textContent).toContain("3s");
    expect(menu.classList.contains("hud-v2-expanded")).toBe(false);
    const cancel = document.querySelector<HTMLButtonElement>('[data-v2-progress-action="cancel_settle"]')!;
    const rush = document.querySelector<HTMLButtonElement>('[data-v2-progress-action="rush_buy"]')!;
    const toggle = document.querySelector('[data-hud-v2-panel="progress"]');
    cancel.focus();
    cancel.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    view.progress = { ...view.progress!, remainingLabel: "2s", progress: 0.9, rushBuyLabel: "Rush 2" };
    renderTileActionMenu(state, view, 100, 100, deps);
    expect(document.querySelector('[data-v2-progress-action="cancel_settle"]')).toBe(cancel);
    expect(document.querySelector('[data-v2-progress-action="rush_buy"]')).toBe(rush);
    expect(document.querySelector('[data-hud-v2-panel="progress"]')).toBe(toggle);
    expect(document.activeElement).toBe(cancel);
    expect(rush.textContent).toBe("Rush 2");
    expect(document.querySelector('[aria-label="Tile progress"]')?.textContent).toContain("2s");
    cancel.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    rush.click();
    click('[data-v2-progress-action="cancel_settle"]');
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "RUSH_BUY", x: 3, y: 4 });
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "CANCEL_SETTLE", x: 3, y: 4 });
    expect(clearSettlementProgressByKey).toHaveBeenCalledWith("3,4");
    click('[data-hud-v2-panel="progress"]');
    expect(document.querySelector('[aria-label="Tile progress"]')).toBeNull();
  });
});
