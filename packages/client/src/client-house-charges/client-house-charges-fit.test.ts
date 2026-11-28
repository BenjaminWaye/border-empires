// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import { PerspectiveCamera, Vector3 } from "three";
import { MIN_ZOOM } from "../client-constants.js";
import { applyPerspectiveCamera } from "../client-map-3d-perspective-camera/client-map-3d-perspective-camera.js";
import { houseChargeFitDiscs, houseChargeFitView, UNSCOUTED_CHARGE_MIN_ZOOM } from "./client-house-charges-fit.js";
import { roughCircleFor } from "./client-house-charges-search-guide.js";
import { showHouseChargeOnMap, takeHouseChargeMapShowRequest } from "./client-house-charges-panel.js";

const road = (a: { x: number; y: number }, b: { x: number; y: number }): HouseChargeView => ({
  id: "CHARTER:a|b",
  kind: "CHARTER",
  title: "Road of Vell and Harrowmere",
  rarity: "COMMON",
  renown: 2,
  kept: true,
  held: false,
  size: 0,
  searchCircle: { x: 30, y: 20, radius: 20 },
  targets: [{ key: `town:${a.x},${a.y}`, name: "Vell", ...a }, { key: `town:${b.x},${b.y}`, name: "Harrowmere", ...b }]
});
/** Real viewports: the canvas is sized in CSS pixels (client-panel-nav.ts viewportSize). */
const phone = { width: 390, height: 844 };
const desktop = { width: 1920, height: 1080 };
const seen = () => true;

const gap = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b) % size;
  return Math.min(d, size - d);
};

/** 2D: `zoom` canvas pixels per tile around the camera centre. */
const onScreen2D = (canvas: { width: number; height: number }, view: { x: number; y: number; zoom: number }, x: number, y: number): boolean =>
  gap(view.x, x, WORLD_WIDTH) <= canvas.width / view.zoom / 2 && gap(view.y, y, WORLD_HEIGHT) <= canvas.height / view.zoom / 2;

/** True-3D: projects the tile through the renderer's own perspective camera. */
const onScreen3D = (canvas: { width: number; height: number }, view: { x: number; y: number; zoom: number }, x: number, y: number): boolean => {
  const camera = new PerspectiveCamera();
  applyPerspectiveCamera(camera, { canvasWidth: canvas.width, canvasHeight: canvas.height, zoom: view.zoom });
  const dx = ((x - view.x + WORLD_WIDTH * 1.5) % WORLD_WIDTH) - WORLD_WIDTH / 2;
  const dy = ((y - view.y + WORLD_HEIGHT * 1.5) % WORLD_HEIGHT) - WORLD_HEIGHT / 2;
  const ndc = new Vector3(dx + 0.5, 0, dy + 0.5).project(camera);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
};

const checks = [
  ["2D phone", "2d", phone, onScreen2D],
  ["2D desktop", "2d", desktop, onScreen2D],
  ["true-3D phone", "3d", phone, onScreen3D],
  ["true-3D desktop", "3d", desktop, onScreen3D]
] as const;

// Owner 2026-11-19: Show on map left the cards open over the map and framed only one town; a Charter is two towns
// joined by a road, so the camera must fit both. Review of #2876: in true-3D, and on a real phone, it did not.
describe("Show on map frames the whole charge", () => {
  for (const [label, renderer, canvas, onScreen] of checks) {
    it(`${label}: centres between a Charter's two towns and zooms out until both are on screen`, () => {
      // The widest Charter (35 tiles) on a desktop; a phone at the widest zoom holds about 18.
      const far = canvas === desktop ? { x: 135, y: 104 } : { x: 118, y: 108 };
      const view = houseChargeFitView(road({ x: 100, y: 100 }, far), seen, canvas, 96, renderer);
      expect(view.zoom).toBeLessThan(96);
      expect(onScreen(canvas, view, 100, 100)).toBe(true);
      expect(onScreen(canvas, view, far.x, far.y)).toBe(true);
    });

    it(`${label}: keeps the scouted town on screen when even the widest zoom cannot hold both`, () => {
      // 300 tiles apart: no zoom shows both, so the view must not land on empty map between them.
      const view = houseChargeFitView(road({ x: 400, y: 100 }, { x: 100, y: 100 }), (x) => x === 100, canvas, 22, renderer);
      expect(view.zoom).toBe(MIN_ZOOM);
      expect(onScreen(canvas, view, 100, 100)).toBe(true);
    });
  }

  it("frames the shorter way round the wrapped world", () => {
    const view = houseChargeFitView(road({ x: 3, y: 10 }, { x: WORLD_WIDTH - 4, y: 10 }), seen, desktop, 22);
    expect(gap(view.x, 0, WORLD_WIDTH)).toBeLessThanOrEqual(1);
    expect(view.y).toBe(10);
    expect(onScreen2D(desktop, view, 3, 10)).toBe(true);
    expect(onScreen2D(desktop, view, WORLD_WIDTH - 4, 10)).toBe(true);
  });

  it("never zooms in past where the player already is", () => {
    expect(houseChargeFitView(road({ x: 8, y: 15 }, { x: 10, y: 15 }), seen, phone, 18).zoom).toBe(18);
  });

  it("frames an unscouted town by its rough circle, never its exact tile", () => {
    const charge = road({ x: 8, y: 15 }, { x: 20, y: 22 });
    const discs = houseChargeFitDiscs(charge, (x) => x === 8);
    expect(discs[0]).toEqual({ x: 8, y: 15, radius: 2 });
    expect(discs[1]).toEqual(roughCircleFor(charge.id, charge.targets[1]!, WORLD_WIDTH, WORLD_HEIGHT));
    const view = houseChargeFitView(charge, (x) => x === 8, desktop, 40);
    expect(onScreen2D(desktop, view, discs[1]!.x, discs[1]!.y)).toBe(true);
  });

  it("closes the panel, highlights the charge and asks the HUD to close the screen under it", () => {
    const state = { camX: 300, camY: 300, camSubX: 0.4, camSubY: 0.2, zoom: 22, houseChargeFocusId: undefined as string | undefined, tiles: new Map([["8,15", {}], ["30,22", {}]]) } as never as Parameters<typeof showHouseChargeOnMap>[0];
    const closePanel = vi.fn();
    const charge = road({ x: 8, y: 15 }, { x: 30, y: 22 });
    showHouseChargeOnMap(state, charge, { wrapX: (x) => x, wrapY: (y) => y, requestViewRefresh: vi.fn(), closePanel, viewport: () => desktop, renderer: () => "2d" });
    expect(closePanel).toHaveBeenCalledOnce();
    expect(state.houseChargeFocusId).toBe(charge.id);
    expect(onScreen2D(desktop, { x: state.camX, y: state.camY, zoom: state.zoom }, 8, 15)).toBe(true);
    expect(onScreen2D(desktop, { x: state.camX, y: state.camY, zoom: state.zoom }, 30, 22)).toBe(true);
    expect([state.camSubX, state.camSubY]).toEqual([0, 0]);
    expect(takeHouseChargeMapShowRequest()).toEqual({ x: state.camX, y: state.camY, zoom: state.zoom });
    expect(takeHouseChargeMapShowRequest()).toBeUndefined();
  });
});

// First-15 playtest 2026-11-28 (pt-achiever): Show on map for an unscouted region charge zoomed a phone
// out to about 16 px a tile over fog, too small to tap a tile to explore.
describe("Show on map for a charge with nothing scouted", () => {
  const region: HouseChargeView = {
    id: "DESERT:barrens", kind: "DESERT", title: "Hold Brasslock Barrens", rarity: "COMMON", renown: 1, kept: true, held: false, size: 0,
    searchCircle: { x: 300, y: 200, radius: 9 }, targets: [], areaTileKeys: ["300,200", "301,200", "330,215"]
  } as unknown as HouseChargeView;
  const unseen = () => false;

  it.each([["2d" as const], ["3d" as const]])("%s: centres the search circle at a zoom a tile can be tapped at", (renderer) => {
    const view = houseChargeFitView(region, unseen, phone, 58, renderer);
    expect(view.zoom).toBe(UNSCOUTED_CHARGE_MIN_ZOOM);
    expect([view.x, view.y]).toEqual([300, 200]);
  });

  it("never zooms in past where the player already is", () => {
    expect(houseChargeFitView(region, unseen, phone, 20).zoom).toBe(20);
  });

  it("still zooms out as far as needed once its ground is scouted", () => {
    expect(houseChargeFitView(region, () => true, phone, 58).zoom).toBeLessThan(UNSCOUTED_CHARGE_MIN_ZOOM);
  });
});
