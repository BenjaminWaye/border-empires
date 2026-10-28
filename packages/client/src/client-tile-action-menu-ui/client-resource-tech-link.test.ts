// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo, Tile, TileMenuView } from "../client-types.js";
import { resourceTileOverviewLines } from "../client-tile-menu-view/client-resource-tile-copy.js";
import { clearScreen, screen, type HudV2Deps } from "../client-hud-v2/client-hud-v2-context.js";
import { initHudV2Flag } from "../client-hud-v2/client-hud-v2-flag.js";
import { openRequestedTechDetail } from "../client-hud-v2/client-hud-v2-screens.js";
import { renderTileActionMenu } from "./client-tile-action-menu-ui.js";

const tech: TechInfo = {
  id: "frontier-concessions", name: "Frontier Export Charter", tier: 1, branch: "economy",
  prereqIds: [], description: "Export rights", mods: {}, effects: {},
  requirements: { gold: 10, resources: {}, canResearch: true }
};

const fixture = (mobile: boolean) => {
  const state = createInitialState();
  state.me = "me";
  state.techCatalog = [tech];
  state.techChoices = [tech.id];
  state.gold = 100;
  const tile: Tile = { x: 4, y: 4, terrain: "LAND", resource: "LUXURY_BIOTA" };
  state.tiles.set("4,4", tile);
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.currentTileKey = "4,4";
  state.tileActionMenu.activeTab = "overview";
  const view: TileMenuView = {
    title: "Luxury biota", subtitle: "Unclaimed", tabs: ["overview"], actions: [], buildings: [], crystal: [],
    overviewLines: resourceTileOverviewLines(tile, state.techCatalog, state.techIds)
  };
  document.body.innerHTML = '<div id="tile-action-menu"></div><div id="hud-v2-screen"></div><section id="hud-v2-tile" hidden></section><aside id="hud-v2-build" hidden></aside>';
  const menu = document.getElementById("tile-action-menu") as HTMLDivElement;
  const deps: Parameters<typeof renderTileActionMenu>[4] = {
    tileActionMenuEl: menu, viewportSize: () => ({ width: 1200, height: 900 }), isMobile: () => mobile,
    hideTileActionMenu: vi.fn(), tileMenuViewForTile: () => view, handleTileAction: vi.fn(),
    cancelQueuedSettlement: () => false, cancelQueuedBuild: () => false, cancelQueuedAutoSettle: () => false,
    moveQueuedEntryToFront: () => false, cancelQueuedWaypointEntry: () => false, moveWaypointToFront: () => false,
    cancelQueuedExpandEntry: () => false, moveActionQueueEntryToFront: () => false, cancelOngoingCapture: vi.fn(),
    sendGameMessage: () => true, applyOptimisticStructureCancel: vi.fn(), clearSettlementProgressByKey: vi.fn(),
    renderHud: vi.fn(), requestAttackPreviewForTarget: vi.fn(), keyFor: (x, y) => `${x},${y}`, isTileOwnedByAlly: () => false
  };
  return { state, view, menu, deps };
};

describe("resource technology navigation", () => {
  afterEach(() => {
    clearScreen();
    screen.manifestSelectedId = "";
    screen.manifestClosedLanes.clear();
    document.body.innerHTML = "";
  });

  it.each([false, true])("opens the actual required technology from the tile overview, mobile=%s", mobile => {
    initHudV2Flag("?hud=legacy");
    const f = fixture(mobile);
    renderTileActionMenu(f.state, f.view, 30, 30, f.deps);
    const link = f.menu.querySelector<HTMLButtonElement>('[data-view-tech="frontier-concessions"]');
    expect(link?.textContent).toBe("Frontier Export Charter");
    link!.click();
    expect(f.state.activePanel).toBe("tech");
    expect(f.state.techUiSelectedId).toBe(tech.id);
    expect(f.state.techDetailOpen).toBe(true);
    if (mobile) expect(f.state.mobilePanel).toBe("tech");
    expect(f.deps.hideTileActionMenu).toHaveBeenCalledOnce();
  });

  it("routes the same click to the redesigned tree, unfolds the lane and selects a researchable detail", () => {
    initHudV2Flag("?hud=legacy");
    const f = fixture(false);
    renderTileActionMenu(f.state, f.view, 30, 30, f.deps);
    f.menu.querySelector<HTMLButtonElement>('[data-view-tech="frontier-concessions"]')!.click();
    screen.manifestClosedLanes.add("economy");
    const hud: HudV2Deps = {
      state: f.state, renderHud: f.deps.renderHud, requestViewRefresh: vi.fn(), wrapX: x => x, wrapY: y => y,
      isMobile: () => false, sendGameMessage: () => true, ownerColor: () => "#abc123",
      actionFlow: {
        chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), openSingleTileActionMenu: vi.fn(),
        handleTileAction: vi.fn(), hideTileActionMenu: f.deps.hideTileActionMenu,
        tileMenuViewForTile: () => f.view, requestTileDetailIfNeeded: vi.fn()
      }
    };
    openRequestedTechDetail(hud);
    expect(screen.id).toBe("manifest");
    expect(screen.manifestSelectedId).toBe(tech.id);
    expect(screen.manifestClosedLanes.has("economy")).toBe(false);
    expect(f.state.activePanel).toBeNull();
    expect(f.state.techDetailOpen).toBe(false);
    expect(document.querySelector('[data-v2-manifest-select="frontier-concessions"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-v2-manifest-commission="frontier-concessions"]')).not.toBeNull();
  });
  it("keeps the link clickable in the redesigned dock's Details panel", () => {
    initHudV2Flag("?hud=v2");
    const f = fixture(false);
    renderTileActionMenu(f.state, f.view, 30, 30, f.deps);
    document.querySelector<HTMLButtonElement>('[data-hud-v2-panel="details"]')!.click();
    const link = document.querySelector<HTMLButtonElement>('#hud-v2-tile [data-view-tech="frontier-concessions"]');
    expect(link).not.toBeNull();
    link!.click();
    expect(f.state.activePanel).toBe("tech");
    expect(f.state.techUiSelectedId).toBe(tech.id);
    expect(f.state.techDetailOpen).toBe(true);
    expect(f.deps.hideTileActionMenu).toHaveBeenCalledOnce();
  });

});
