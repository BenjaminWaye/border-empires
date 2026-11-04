// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installLens, lensClick, lensMenu, MAP_OVERVIEW_CLASS, mapOverview, overlaysHtml, OVERLAYS_HOST_ID, setMapOverview } from "./client-hud-v2-overlays.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

const host = (html: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

afterEach(() => {
  setMapOverview(false);
  lensMenu.open = false;
  document.body.className = "";
  document.body.innerHTML = "";
});

// Regression: the compact HUD hid the minimap with no way back to it, so phone players lost the minimap entirely.
describe("phone map overview", () => {
  it("the round button opens the overview on a phone, and the lens list on desktop as before", () => {
    const state = { showDiplomacyOverlay: false };
    const toggle = host(overlaysHtml(false, false)).querySelector("[data-hud-v2-lens-toggle]")!;
    expect(lensClick(state, toggle, true)).toEqual({ handled: true, viewChanged: false });
    expect(mapOverview.open).toBe(true);
    expect(lensMenu.open).toBe(false);
    expect(document.body.classList.contains(MAP_OVERVIEW_CLASS)).toBe(true);
    setMapOverview(false);
    lensClick(state, toggle, false);
    expect(mapOverview.open).toBe(false);
    expect(lensMenu.open).toBe(true);
  });

  it("shows the lenses with the one in use checked, and a close button", () => {
    const view = host(overlaysHtml(true, false, true));
    expect(view.querySelector('[data-hud-v2-lens="diplomacy"]')?.getAttribute("aria-checked")).toBe("true");
    expect(view.querySelector('[data-hud-v2-lens="terrain"]')?.getAttribute("aria-checked")).toBe("false");
    expect(view.querySelector("[data-v2c-map-close]")).not.toBeNull();
    expect(view.querySelector("[data-hud-v2-lens-toggle]")).toBeNull();
  });

  it("picking a lens there switches it and keeps the overview open; ✕ closes it", () => {
    const state = { showDiplomacyOverlay: false };
    setMapOverview(true);
    const view = host(overlaysHtml(false, false, true));
    expect(lensClick(state, view.querySelector('[data-hud-v2-lens="diplomacy"]')!, true)).toEqual({ handled: true, viewChanged: true });
    expect(state.showDiplomacyOverlay).toBe(true);
    expect(mapOverview.open).toBe(true);
    lensClick(state, view.querySelector("[data-v2c-map-close]")!, true);
    expect(mapOverview.open).toBe(false);
    expect(document.body.classList.contains(MAP_OVERVIEW_CLASS)).toBe(false);
  });

  it("a tap on the map closes the overview (the minimap has already centred the view), and so does Esc", () => {
    document.body.innerHTML = `<div id="mini-map-wrap"><canvas id="mini-map"></canvas></div><div id="${OVERLAYS_HOST_ID}"></div>`;
    const rerender = vi.fn();
    installLens({ state: { showDiplomacyOverlay: false }, requestViewRefresh: vi.fn() } as unknown as HudV2Deps, rerender);
    setMapOverview(true);
    document.getElementById("mini-map")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(mapOverview.open).toBe(false);
    expect(rerender).toHaveBeenCalled();
    setMapOverview(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(mapOverview.open).toBe(false);
  });
});

describe("overview canvas resolution", () => {
  it("renders at the screen's pixel density, between the 220px corner size and 960px", async () => {
    const { overviewCanvasPx } = await import("./client-hud-v2-overlays.js");
    expect(overviewCanvasPx(368, 3)).toBe(960);
    expect(overviewCanvasPx(300, 2)).toBe(600);
    expect(overviewCanvasPx(100, 1)).toBe(220);
  });

  it("puts the minimap back to 220px when the overview closes", () => {
    document.body.innerHTML = `<canvas id="mini-map" width="220" height="220"></canvas>`;
    const canvas = document.getElementById("mini-map") as HTMLCanvasElement;
    setMapOverview(true);
    canvas.width = canvas.height = 900;
    setMapOverview(false);
    expect([canvas.width, canvas.height]).toEqual([220, 220]);
  });
});
