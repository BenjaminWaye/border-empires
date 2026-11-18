// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { closeTownScreen, townOnMenuView } from "./client-hud-v2-town-runtime.js";
import { syncTownBarHeight, TOWN_BAR_HEIGHT_VAR, unwatchTownBarHeight, watchTownBarHeight } from "./client-hud-v2-town-bar-height.js";

const setup = (height: number): { host: HTMLElement; bar: HTMLElement; resize: (h: number) => void } => {
  const host = document.createElement("div");
  const bar = document.createElement("div");
  host.appendChild(bar);
  let current = height;
  bar.getBoundingClientRect = () => ({ height: current } as DOMRect);
  return { host, bar, resize: (h) => { current = h; } };
};

/** Records observers so a test can fire the resize callback a real browser would. */
const stubResizeObserver = (): { fire: () => void; observedTargets: () => Element[] } => {
  const observers: Array<{ cb: ResizeObserverCallback; targets: Element[]; live: boolean }> = [];
  class FakeResizeObserver {
    private readonly entry: { cb: ResizeObserverCallback; targets: Element[]; live: boolean };
    constructor(cb: ResizeObserverCallback) { this.entry = { cb, targets: [], live: true }; observers.push(this.entry); }
    observe(target: Element): void { this.entry.targets.push(target); }
    unobserve(): void {}
    disconnect(): void { this.entry.live = false; this.entry.targets = []; }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return {
    fire: () => observers.filter((o) => o.live).forEach((o) => o.cb([], o as unknown as ResizeObserver)),
    observedTargets: () => observers.filter((o) => o.live).flatMap((o) => o.targets)
  };
};

describe("syncTownBarHeight", () => {
  it("publishes the bar's full height so the panels above end where a two-row bar starts", () => {
    const { host, bar } = setup(171.4);
    syncTownBarHeight(bar);
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("172px");
  });

  it("falls back to the stylesheet reserve while the bar has no layout", () => {
    const { host, bar } = setup(0);
    host.style.setProperty(TOWN_BAR_HEIGHT_VAR, "150px");
    syncTownBarHeight(bar);
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("");
  });

  it("ignores a missing bar", () => {
    expect(() => syncTownBarHeight(null)).not.toThrow();
  });
});

describe("watchTownBarHeight", () => {
  afterEach(() => {
    unwatchTownBarHeight();
    vi.unstubAllGlobals();
  });

  // Review of #2863: rotating the phone or swapping the auto-settle row in place resizes the bar without a
  // town re-render, so a render-time measurement went stale and the build list slid under the bar again.
  it("re-measures when the bar resizes without a re-render", () => {
    const ro = stubResizeObserver();
    const { host, bar, resize } = setup(110);
    watchTownBarHeight(bar);
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("110px");
    resize(230);
    ro.fire();
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("230px");
  });

  it("observes only the current bar and clears the height when the screen closes", () => {
    const ro = stubResizeObserver();
    const first = setup(100);
    const second = setup(140);
    watchTownBarHeight(first.bar);
    watchTownBarHeight(first.bar);
    watchTownBarHeight(second.bar);
    expect(ro.observedTargets()).toEqual([second.bar]);
    unwatchTownBarHeight();
    expect(ro.observedTargets()).toEqual([]);
    expect(second.host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("");
  });
});

describe("town screen bar height wiring", () => {
  afterEach(() => {
    closeTownScreen();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("publishes the rendered town bar's height on the screen host and drops it on close", () => {
    const ro = stubResizeObserver();
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const proto = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.id === "v2t-bar" ? ({ height: 196 } as DOMRect) : proto.call(this);
    });
    const state = createInitialState();
    state.me = "me";
    const tile: Tile = {
      x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "full",
      town: {
        name: "Alder", type: "FARMING", terrainProfile: "GRASS", coastal: false, populationTier: "TOWN",
        population: 25000, maxPopulation: 100000, populationGrowthPerMinute: 10,
        baseGoldPerMinute: 0, goldPerMinute: 0, cap: 0, supportCurrent: 0, supportMax: 8, isFed: true,
        connectedTownCount: 0, connectedTownBonus: 0, hasManufactory: false, manufactoryActive: false,
        hasIncubationEngine: false, incubationEngineActive: false
      }
    };
    state.tiles.set("5,5", tile);
    const view: TileMenuView = { title: "Town", subtitle: "", tabs: ["overview"], overviewLines: [], actions: [], buildings: [], crystal: [] };
    const deps: HudV2Deps = {
      state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x) => x, wrapY: (y) => y,
      setActivePanel: vi.fn(), sendGameMessage: () => true, ownerColor: () => "#888",
      actionFlow: {
        chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
        requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: () => view, openSingleTileActionMenu: vi.fn()
      }
    };
    townOnMenuView(deps, view, "5,5");
    const host = document.getElementById(SCREEN_HOST_ID)!;
    const bar = document.getElementById("v2t-bar");
    expect(bar?.parentElement).toBe(host);
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("196px");
    expect(ro.observedTargets()).toEqual([bar]);
    closeTownScreen();
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("");
    expect(ro.observedTargets()).toEqual([]);
  });
});
