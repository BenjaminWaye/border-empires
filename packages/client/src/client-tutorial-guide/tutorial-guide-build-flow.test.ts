// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { clearScreen, screen, type HudV2Deps } from "../client-hud-v2/client-hud-v2-context.js";
import { townOnMenuView } from "../client-hud-v2/client-hud-v2-town-runtime.js";
import { screenClick } from "../client-hud-v2/client-hud-v2-screens.js";
import { findGuideAnchorElement } from "./tutorial-guide-anchor.js";
import { GUIDE_STEPS } from "./tutorial-guide-steps.js";
import { markGuideStepsCompleted, resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { renderTutorialGuide, resetTutorialGuideForTests } from "./tutorial-guide.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  resetGuideStorageMemoryForTests();
  resetTutorialGuideForTests();
  resetGuideInputCacheForTests();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40, toJSON: () => ({}) };
  });
});
afterEach(() => { clearScreen(); vi.restoreAllMocks(); });

it("opens town support and moves the guide outline from Manufactory to Place", () => {
  const state = createInitialState();
  state.me = "me";
  state.authEmail = "builder@example.com";
  state.techIds = ["trade"];
  state.resourceSlots.supply.FOOD = 5;
  state.resourceSlots.demand.FOOD = 4;
  const town: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    town: { type: "MARKET", populationTier: "TOWN", population: 1000 } as NonNullable<Tile["town"]> };
  state.tiles.set("4,4", town);
  state.tiles.set("1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED",
    afc: { ownerId: "me", status: "active", modules: ["trade"] } });
  const view: TileMenuView = { title: "Town", subtitle: "", tabs: [], overviewLines: [], actions: [], crystal: [],
    buildings: [{ id: "build_palisade", label: "Build Palisade" }, { id: "build_manufactory", label: "Build Manufactory" }] };
  document.body.innerHTML = '<div id="hud-v2-screen"></div>';
  const deps: HudV2Deps = {
    state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: x => x, wrapY: y => y,
    isMobile: () => false, sendGameMessage: () => true, ownerColor: () => "#888",
    actionFlow: { chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
      requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: () => view, openSingleTileActionMenu: vi.fn() }
  };
  screen.townCategory = "military"; // A prior town visit must not change the default on re-entry.
  townOnMenuView(deps, view, "4,4");
  expect(document.querySelector('[data-v2-build-category="town_support"]')?.getAttribute("aria-selected")).toBe("true");
  expect(document.querySelector('[data-v2-build-pick="build_manufactory"]')).not.toBeNull();
  setGuideStatus("active", state.authEmail);
  markGuideStepsCompleted(GUIDE_STEPS.filter(s => s.id !== "build-first" && !s.acknowledge).map(s => s.id), state.authEmail);
  renderTutorialGuide(state, false);
  expect(findGuideAnchorElement("manufactory")?.getAttribute("data-v2-build-pick")).toBe("build_manufactory");
  expect(document.getElementById("tutorial-guide-anchor-outline")).not.toBeNull();
  expect(screenClick(deps, document.querySelector<HTMLElement>('[data-v2-build-pick="build_manufactory"]')!)).toBe(true);
  renderTutorialGuide(state, false);
  expect(findGuideAnchorElement("manufactory")?.getAttribute("data-hud-v2-action")).toBe("build_manufactory");
});
