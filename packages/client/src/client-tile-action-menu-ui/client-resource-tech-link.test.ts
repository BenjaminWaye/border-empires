// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { TechInfo, Tile, TileMenuView } from "../client-types.js";
import { resourceTileOverviewLines } from "../client-tile-menu-view/client-resource-tile-copy.js";
import { clearScreen, screen, type HudV2Deps } from "../client-hud-v2/client-hud-v2-context.js";
import { initHudV2Flag } from "../client-hud-v2/client-hud-v2-flag.js";
import { openRequestedTechDetail } from "../client-hud-v2/client-hud-v2-screens.js";
import { structureInfoForKey } from "../client-map-display.js";
import { renderStructureInfoOverlay } from "../client-structure-info-overlay/client-structure-info-overlay.js";
import { bindStructureInfoActions } from "../client-structure-info-overlay/client-structure-info-actions.js";
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
    overviewLines: resourceTileOverviewLines(tile)
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

const openStructurePopup = (f: ReturnType<typeof fixture>): HTMLDivElement => {
  const popup = document.createElement("div");
  const info = (type: Parameters<typeof structureInfoForKey>[0]) => structureInfoForKey(type, { formatCooldownShort: () => "1m", prettyToken: value => value });
  popup.innerHTML = renderStructureInfoOverlay(f.state.structureInfoKey, info, undefined, f.state.techCatalog);
  document.body.append(popup);
  bindStructureInfoActions(popup, { state: f.state, renderHud: f.deps.renderHud, isMobile: f.deps.isMobile });
  return popup;
};

describe("resource to structure to technology navigation", () => {
  afterEach(() => {
    clearScreen();
    screen.manifestSelectedId = "";
    screen.manifestClosedLanes.clear();
    initHudV2Flag("?hud=legacy");
    document.body.innerHTML = "";
  });

  it.each([false, true])("opens required research through the linked installation, mobile=%s", mobile => {
    initHudV2Flag("?hud=legacy");
    const f = fixture(mobile);
    renderTileActionMenu(f.state, f.view, 30, 30, f.deps);
    expect(f.menu.querySelector("[data-view-tech]")).toBeNull();
    const installation = f.menu.querySelector<HTMLButtonElement>('[data-structure-info="CULTIVATION_ESTATE"]');
    expect(installation).not.toBeNull();
    installation!.click();
    expect(f.state.structureInfoKey).toBe("CULTIVATION_ESTATE");
    const popup = openStructurePopup(f);
    const techLink = popup.querySelector<HTMLButtonElement>('[data-view-tech="frontier-concessions"]');
    expect(techLink?.textContent).toBe("Frontier Export Charter");
    techLink!.click();
    expect(f.state.structureInfoKey).toBe("");
    expect(f.state.activePanel).toBe("tech");
    expect(f.state.techUiSelectedId).toBe(tech.id);
    expect(f.state.techDetailOpen).toBe(true);
    if (mobile) expect(f.state.mobilePanel).toBe("tech");
    expect(f.deps.handleTileAction).not.toHaveBeenCalled();
  });

  it("follows the dock's structure link through its unlock into the redesigned tree", () => {
    initHudV2Flag("?hud=v2");
    const f = fixture(false);
    renderTileActionMenu(f.state, f.view, 30, 30, f.deps);
    document.querySelector<HTMLButtonElement>('[data-hud-v2-panel="details"]')!.click();
    expect(document.querySelector("#hud-v2-tile [data-view-tech]")).toBeNull();
    document.querySelector<HTMLButtonElement>('#hud-v2-tile [data-structure-info="CULTIVATION_ESTATE"]')!.click();
    expect(f.state.structureInfoKey).toBe("CULTIVATION_ESTATE");
    openStructurePopup(f).querySelector<HTMLButtonElement>('[data-view-tech="frontier-concessions"]')!.click();
    expect(f.state.structureInfoKey).toBe("");
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
    expect(document.querySelector('[data-v2-manifest-select="frontier-concessions"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-v2-manifest-commission="frontier-concessions"]')).not.toBeNull();
    expect(hud.actionFlow.chooseTech).not.toHaveBeenCalled();
  });
});
