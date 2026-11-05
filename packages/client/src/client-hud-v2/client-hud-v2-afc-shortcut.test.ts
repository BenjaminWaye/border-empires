// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { AFC_SPECIALIZATIONS } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { TileMenuView } from "../client-types.js";
import { installHudV2 } from "./client-hud-v2.js";
import { clearScreen, screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { dockTileActionMenuForHudV2 } from "./client-hud-v2-tile-dock.js";

// Exercise the actual dock and HUD click handlers: the tile panel normally
// stops the HUD's layer handler, which used to make screen links here inert.
afterEach(() => { vi.useRealTimers(); clearScreen(); document.body.innerHTML = ""; });

it("opens AFC upgrades from the yellow action and keeps the shortcut with no ready upgrade", () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="hud"></div><div id="tile-action-menu"></div>';
  const state = createInitialState();
  state.me = "me";
  state.afcUpgradeRuleset = "afc-v1";
  state.afcUpgradeInstallAllowed = true;
  state.techIds = ["tier1"];
  state.techCatalog = [{ id: "tier1", name: "Tier 1", tier: 1, description: "", mods: {}, requirements: { gold: 0, resources: {} } }];
  state.domainCatalog = AFC_SPECIALIZATIONS.map(upgrade => ({ ...upgrade, mods: {}, requirements: { gold: 0, resources: {} } }));
  state.domainChoices = state.domainCatalog.filter(upgrade => upgrade.tier === 1).map(upgrade => upgrade.id);
  state.tiles.set("4,4", { x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    afc: { ownerId: "me", status: "active" } });
  state.tileActionMenu.mode = "single";
  state.tileActionMenu.currentTileKey = "4,4";
  const view: TileMenuView = { title: "AFC", subtitle: "Your garrisoned land", tabs: ["modules"], overviewLines: [],
    actions: [], buildings: [{ id: "build_relay_beacon", label: "Build Relay Beacon" }], crystal: [] };
  const deps: HudV2Deps = {
    state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: x => x, wrapY: y => y,
    isMobile: () => false, sendGameMessage: () => true, ownerColor: () => "#888",
    actionFlow: { chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
      requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: () => view, openSingleTileActionMenu: vi.fn() }
  };
  installHudV2(deps);
  const render = () => dockTileActionMenuForHudV2(state, view, {
    tileActionMenuEl: document.getElementById("tile-action-menu")!, isMobile: deps.isMobile,
    handleTileAction: deps.actionFlow.handleTileAction, hideTileActionMenu: deps.actionFlow.hideTileActionMenu, renderHud: deps.renderHud
  }, vi.fn());
  render();
  const bar = document.getElementById("hud-v2-tile")!;
  const upgrade = bar.querySelector<HTMLButtonElement>('.hud-v2-act-primary[data-hud-v2-open="afc"]');
  expect(upgrade?.textContent).toContain("1 ready");
  expect(bar.querySelector('.hud-v2-act-primary[data-hud-v2-action="build_relay_beacon"]')).toBeNull();
  expect(bar.querySelector('[data-hud-v2-tab="modules"]')).not.toBeNull();
  upgrade!.click();
  expect(screen.id).toBe("afc");
  expect(state.activePanel).toBe("domains");
  expect(deps.actionFlow.handleTileAction).not.toHaveBeenCalled();
  clearScreen();
  state.domainChoices = [];
  render();
  expect(bar.querySelector('[data-hud-v2-open="afc"]')?.textContent).toContain("AFC upgrades");
  expect(bar.querySelector('[data-hud-v2-tab="modules"]')).not.toBeNull();
  state.tiles.get("4,4")!.ownerId = "rival";
  render();
  expect(bar.querySelector('[data-hud-v2-open="afc"]')).toBeNull();
});
