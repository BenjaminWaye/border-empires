// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HudV2Deps } from "./client-hud-v2-context.js";
import { activeLens, installLens, lensClick, lensMenu, mapOverview, overlaysHtml, OVERLAYS_HOST_ID, setMapOverview } from "./client-hud-v2-overlays.js";
import { ownerStanceTagHtml } from "./client-hud-v2-stance-tag.js";
import { closeWorldMap, installWorldMap, isWorldMapOpen, WORLD_MAP_ID } from "../client-world-map/client-world-map.js";

const host = (html: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

describe("map lens button", () => {
  beforeEach(() => {
    lensMenu.open = false;
  });

  it("is one notched button with no legend, and lists the lenses only while open", () => {
    const closed = host(overlaysHtml(false, false));
    expect(closed.querySelectorAll("button")).toHaveLength(1);
    expect(closed.querySelector("[data-hud-v2-lens-toggle]")?.getAttribute("aria-expanded")).toBe("false");
    // Regression: the old toggle reused the Allies icon and drew a legend box beside the minimap.
    expect(closed.innerHTML).not.toContain("alliance.svg");
    expect(closed.innerHTML).not.toContain("legend");
    const open = host(overlaysHtml(false, true));
    expect(Array.from(open.querySelectorAll<HTMLElement>("[data-hud-v2-lens]")).map((b) => b.dataset.hudV2Lens)).toEqual(["terrain", "diplomacy", "resources"]);
    expect(open.querySelector('[data-hud-v2-lens="terrain"]')?.getAttribute("aria-checked")).toBe("true");
    // The list follows its button in tab order.
    expect(open.firstElementChild?.hasAttribute("data-hud-v2-lens-toggle")).toBe(true);
  });

  // 2026-11-14 playtest: nobody found photo mode three taps deep in Settings > Gameplay.
  it("offers Photo mode from the open lens list and the phone map overview", () => {
    expect(host(overlaysHtml(false, true)).querySelector("[data-hud-v2-photo]")?.textContent).toBe("Photo mode");
    expect(host(overlaysHtml(false, false, true)).querySelector(".v2c-map-head [data-hud-v2-photo]")).not.toBeNull();
    expect(host(overlaysHtml(false, false)).querySelector("[data-hud-v2-photo]")).toBeNull();
  });

  // 2026-11-14 playtest: the Resources lens painted tiles in colours nobody could name.
  it("shows a key while the Resources lens is on, on the map and in the phone overview", () => {
    const key = host(overlaysHtml("resources", false)).querySelector(".hud-v2-lens-legend");
    expect(key?.textContent).toContain("Titanium");
    expect(key?.textContent).toContain("Grain");
    expect(key?.textContent).toContain("Tiles in sight only");
    expect(host(overlaysHtml("resources", false, true)).querySelector(".v2c-map-lenses .hud-v2-lens-legend")).not.toBeNull();
    expect(host(overlaysHtml("diplomacy", false)).querySelector(".hud-v2-lens-legend")).toBeNull();
  });

  it("shows the active lens on the button", () => {
    const on = host(overlaysHtml(true, false));
    expect(on.querySelector("img")?.getAttribute("src")).toBe("/icons/simple/lens-diplomacy.svg");
    expect(on.querySelector(".hud-v2-lens-on")).not.toBeNull();
    expect(host(overlaysHtml(false, false)).querySelector("img")?.getAttribute("src")).toBe("/icons/simple/lens.svg");
  });

  it("opens the list, then a pick sets the view and folds the list", () => {
    const state = { showDiplomacyOverlay: false };
    const toggle = host(overlaysHtml(false, false)).querySelector("[data-hud-v2-lens-toggle]")!;
    expect(lensClick(state, toggle)).toEqual({ handled: true, viewChanged: false });
    expect(lensMenu.open).toBe(true);
    const pick = host(overlaysHtml(false, true)).querySelector('[data-hud-v2-lens="diplomacy"]')!;
    expect(lensClick(state, pick)).toEqual({ handled: true, viewChanged: true });
    expect(state.showDiplomacyOverlay).toBe(true);
    expect(lensMenu.open).toBe(false);
    lensMenu.open = true;
    const same = host(overlaysHtml(true, true)).querySelector('[data-hud-v2-lens="diplomacy"]')!;
    expect(lensClick(state, same)).toEqual({ handled: true, viewChanged: false });
    expect(lensMenu.open).toBe(false);
  });

  it("switches between Diplomacy and Resources so only one lens is ever on", () => {
    const state = { showDiplomacyOverlay: true, showResourceOverlay: false };
    const pick = (lens: string): Element => host(overlaysHtml("terrain", true)).querySelector(`[data-hud-v2-lens="${lens}"]`)!;
    expect(lensClick(state, pick("resources"))).toEqual({ handled: true, viewChanged: true });
    expect(state).toEqual({ showDiplomacyOverlay: false, showResourceOverlay: true });
    expect(activeLens(state.showDiplomacyOverlay, state.showResourceOverlay)).toBe("resources");
    expect(host(overlaysHtml("resources", false)).querySelector("img")?.getAttribute("src")).toBe("/icons/simple/lens-resources.svg");
    expect(lensClick(state, pick("terrain"))).toEqual({ handled: true, viewChanged: true });
    expect(state).toEqual({ showDiplomacyOverlay: false, showResourceOverlay: false });
  });
});

describe("installed lens", () => {
  // Regression: the lens's Esc used stopPropagation, so the HUD's Esc on the same window still ran and opened Settings.
  it("folds the open list on Esc without letting the HUD's own Esc handler run", () => {
    document.body.innerHTML = `<div id="mini-map-wrap"></div><div id="${OVERLAYS_HOST_ID}" class="hud-v2-overlays"></div>`;
    const deps = { state: { showDiplomacyOverlay: false }, requestViewRefresh: vi.fn() } as unknown as HudV2Deps;
    const rerender = vi.fn(() => {
      document.getElementById(OVERLAYS_HOST_ID)!.innerHTML = overlaysHtml(false, lensMenu.open);
    });
    installLens(deps, rerender);
    const hudEscape = vi.fn();
    window.addEventListener("keydown", hudEscape, true);
    expect(document.getElementById(OVERLAYS_HOST_ID)?.parentElement?.id).toBe("mini-map-wrap");
    lensMenu.open = true;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(lensMenu.open).toBe(false);
    expect(hudEscape).not.toHaveBeenCalled();
    // With the list folded, Esc is the HUD's again.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(hudEscape).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", hudEscape, true);
  });
});

describe("tile owner stance tag", () => {
  const state = { me: "me", allies: ["a"], activeTruces: [{ otherPlayerId: "t", otherPlayerName: "T", startedAt: 0, endsAt: 5.5 * 3_600_000, createdByPlayerId: "me" }] };

  it("tags allies, truces with time left, and everyone else (barbarians too) as hostile", () => {
    expect(ownerStanceTagHtml("a", state, 0)).toContain(">Ally<");
    expect(ownerStanceTagHtml("t", state, 0)).toContain(">Truce 5h 30m<");
    expect(ownerStanceTagHtml("x", state, 0)).toContain("hud-v2-stance-hostile");
    expect(ownerStanceTagHtml("barbarian-1", state, 0)).toContain(">Hostile<");
  });

  it("has no tag for your own or unowned land", () => {
    expect(ownerStanceTagHtml("me", state, 0)).toBe("");
    expect(ownerStanceTagHtml(undefined, state, 0)).toBe("");
  });

  it("counts down in minutes in a truce's last hour", () => {
    expect(ownerStanceTagHtml("t", state, 5.5 * 3_600_000 - 18 * 60_000)).toContain(">Truce 18m<");
  });
});

describe("phone map overview: whole world", () => {
  it("offers World only in the overview, and a place picked there closes the overview too", () => {
    expect(host(overlaysHtml(false, false, true)).querySelector(".v2c-map-head [data-v2c-world-map]")?.textContent).toBe("World");
    expect(host(overlaysHtml(false, false)).querySelector("[data-v2c-world-map]")).toBeNull();
    document.body.innerHTML = `<div id="mini-map-wrap"></div><div id="${OVERLAYS_HOST_ID}" class="hud-v2-overlays"></div>`;
    const state = { showDiplomacyOverlay: false, camX: 0, camY: 0, camSubX: 0, camSubY: 0, zoom: 20, me: "", tiles: new Map(), tilesRevision: 0, discoveredTiles: new Set<string>() };
    const deps = { state, requestViewRefresh: vi.fn() } as unknown as HudV2Deps;
    const rerender = vi.fn(() => {
      document.getElementById(OVERLAYS_HOST_ID)!.innerHTML = overlaysHtml(false, lensMenu.open, mapOverview.open);
    });
    installLens(deps, rerender);
    installWorldMap({ state, mapCanvas: document.createElement("canvas"), ownerColor: () => "#ffffff", terrainAt: () => "LAND", wrapX: (x) => x, wrapY: (y) => y, requestViewRefresh: vi.fn(), maybeRefreshForCamera: vi.fn() });
    setMapOverview(true);
    rerender();
    document.querySelector<HTMLElement>("[data-v2c-world-map]")!.click();
    expect(isWorldMapOpen()).toBe(true);
    // Esc closes the world map first and leaves the overview open beneath it.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(isWorldMapOpen()).toBe(false);
    expect(mapOverview.open).toBe(true);
    document.querySelector<HTMLElement>("[data-v2c-world-map]")!.click();
    const canvas = document.getElementById(WORLD_MAP_ID)!.querySelector("canvas")!;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320, x: 0, y: 0, toJSON: () => ({}) });
    canvas.dispatchEvent(new MouseEvent("click", { clientX: 40.5, clientY: 30.5, bubbles: true }));
    expect(state.camX).toBe(40);
    expect(state.camY).toBe(30);
    expect(mapOverview.open).toBe(false);
    closeWorldMap();
  });
});
