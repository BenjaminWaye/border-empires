// @vitest-environment happy-dom
// Regressions from the 2026-11 guide playtest (late start, card placement,
// scout drone vs towns across water). Per-season enrollment and the Finish
// card are covered in tutorial-guide-storage.test.ts and tutorial-guide.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { tickOnboardingUiGateForFrame } from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { markGuideStepsCompleted, resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";
import { GUIDE_SIDE_END_CLASS, guideCardOnEndSide, resetGuidePlacementForTests } from "./tutorial-guide-placement.js";
import { createGuideTownRouteCheck } from "./tutorial-guide-town-route.js";
import { guideTargetAction, scanGuideFootholdTargets } from "./tutorial-guide-foothold-targets.js";

const ME = "p1";
const EMAIL = "round3@example.com";

const tile = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as Tile;

const mapState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  state.me = ME;
  state.authEmail = EMAIL;
  state.firstChunkAt = 1;
  state.tiles.set(tileKey(0, 0), tile(0, 0, { ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never }));
  state.tilesRevision += 1;
  return state;
};

const card = () => document.getElementById("tutorial-guide-root");
const cardTitle = () => card()?.querySelector(".tg-card:not([hidden]) .tg-title")?.textContent ?? "";

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  resetGuideStorageMemoryForTests();
  resetGuideInputSignalsForTests();
  resetGuideInputCacheForTests();
  resetTutorialGuideForTests();
  resetGuidePlacementForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("late start: the guide is up on step 1 on first map entry", () => {
  it("shows while the AFC join drop waits for its AFC to come on screen", () => {
    setGuideStatus("active", EMAIL);
    const state = mapState();
    state.afcJoinDrop.phase = "waiting";
    state.afcJoinDrop.gateOpenSince = 0; // AFC off screen: the drop can wait up to 5 minutes
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Drag the map to look around");
  });

  it("still steps aside while the drop is about to play or playing", () => {
    setGuideStatus("active", EMAIL);
    const state = mapState();
    state.afcJoinDrop.phase = "waiting";
    state.afcJoinDrop.gateOpenSince = 100;
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()).toBeNull();
    state.afcJoinDrop.phase = "playing";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()).toBeNull();
  });
});

describe("placement: the card stays off its target and notifications", () => {
  const cardRect = { left: 16, top: 400, right: 286, bottom: 600 };

  it("moves to the other side when its corner covers the target, and stays when it doesn't", () => {
    expect(guideCardOnEndSide(cardRect, false, 1000, [{ left: 80, top: 470, right: 136, bottom: 526 }])).toBe(true);
    expect(guideCardOnEndSide(cardRect, false, 1000, [{ left: 500, top: 470, right: 556, bottom: 526 }])).toBe(false);
    // Both sides covered equally: no flip-flopping.
    expect(guideCardOnEndSide(cardRect, false, 1000, [{ left: 0, top: 450, right: 1000, bottom: 500 }])).toBe(false);
  });

  it("flips the live card off a ringed town under it, using the renderer's projection", () => {
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(["look-pan", "look-zoom", "look-explore"], EMAIL); // on "Tap the marked town and Garrison it"
    const state = mapState();
    state.tiles.set(tileKey(2, 0), tile(2, 0, { ownerId: ME, ownershipState: "FRONTIER", town: { type: "MARKET", populationTier: "TOWN" } as never }));
    state.tilesRevision += 1;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return (this.classList.contains("tg-card") ? { ...cardRect, x: 16, y: 400, width: 270, height: 200 } : { left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    tickOnboardingUiGateForFrame(state, vi.fn(), () => ({ x: 100, y: 500 })); // every target lands under the card
    expect(cardTitle()).toBe("Tap the marked town and Garrison it");
    expect(card()?.classList.contains(GUIDE_SIDE_END_CLASS)).toBe(true);
  });

  it("flips off a map-anchored notification (salvage toast) under it", () => {
    setGuideStatus("active", EMAIL);
    const state = mapState();
    const layer = document.createElement("div");
    layer.className = "salvage-toast-layer";
    const toast = document.createElement("div");
    layer.appendChild(toast);
    document.body.appendChild(layer);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("tg-card")) return { ...cardRect, x: 16, y: 400, width: 270, height: 200 } as DOMRect;
      if (this === toast) return { left: 40, top: 520, right: 200, bottom: 560, x: 40, y: 520, width: 160, height: 40 } as DOMRect;
      return { left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0 } as DOMRect;
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains(GUIDE_SIDE_END_CLASS)).toBe(true);
  });
});

describe("scout drone vs towns across water (#2838 review)", () => {
  /** Own land at (0,5); a neutral town at (10,5) on a 3x3 island ringed by known sea. */
  const islandTiles = (): Map<string, Tile> => {
    const tiles = new Map<string, Tile>();
    tiles.set(tileKey(0, 5), tile(0, 5, { ownerId: ME, ownershipState: "SETTLED" }));
    for (let y = 3; y <= 7; y++) {
      for (let x = 8; x <= 12; x++) {
        const edge = y === 3 || y === 7 || x === 8 || x === 12;
        tiles.set(tileKey(x, y), edge ? tile(x, y, { terrain: "SEA" }) : tile(x, y));
      }
    }
    tiles.set(tileKey(10, 5), tile(10, 5, { town: { type: "MARKET", populationTier: "TOWN" } as never }));
    return tiles;
  };

  it("finds no overland route to a town cut off by seen water", () => {
    expect(createGuideTownRouteCheck(islandTiles(), ME, [])({ x: 10, y: 5 })).toBe(false);
  });

  it("finds one over land, through unexplored ground, or across a dock pair", () => {
    const bridged = islandTiles();
    bridged.set(tileKey(8, 5), tile(8, 5));
    expect(createGuideTownRouteCheck(bridged, ME, [])({ x: 10, y: 5 })).toBe(true);
    const fogged = islandTiles();
    fogged.delete(tileKey(8, 5)); // unknown ground counts as passable, as in the Expand To planner
    expect(createGuideTownRouteCheck(fogged, ME, [])({ x: 10, y: 5 })).toBe(true);
    const docked = islandTiles();
    docked.set(tileKey(1, 5), tile(1, 5, { dockId: "d1" }));
    docked.set(tileKey(9, 5), tile(9, 5, { dockId: "d2" }));
    expect(createGuideTownRouteCheck(docked, ME, [{ ax: 1, ay: 5, bx: 9, by: 5 }])({ x: 10, y: 5 })).toBe(true);
  });

  it("asks for the scout drone, not an Expand To the menu won't offer, when every known town is across water", () => {
    const tiles = islandTiles();
    const targets = scanGuideFootholdTargets(tiles.values(), ME, (t) => Math.abs(t.x) + Math.abs(t.y - 5), () => true, createGuideTownRouteCheck(tiles, ME, []));
    expect(targets.town.expand).toEqual([]);
    expect(targets.town.unreachable).toBe(1);
    expect(guideTargetAction(targets.town, "ready", true)).toBe("explore");
  });
});
