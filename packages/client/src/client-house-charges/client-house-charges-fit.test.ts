// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, type HouseChargeView } from "@border-empires/shared";
import { houseChargeFitDiscs, houseChargeFitView } from "./client-house-charges-fit.js";
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
const phone = { width: 1080, height: 2000 };
const seen = () => true;

/** Whether (x, y) is on a canvas centred on the view (tiles across = canvas pixels / zoom, as both renderers do). */
const onScreen = (view: { x: number; y: number; zoom: number }, x: number, y: number): boolean => {
  const gap = (a: number, b: number, size: number): number => Math.min(Math.abs(a - b) % size, size - (Math.abs(a - b) % size));
  return gap(view.x, x, WORLD_WIDTH) <= phone.width / view.zoom / 2 && gap(view.y, y, WORLD_HEIGHT) <= phone.height / view.zoom / 2;
};

// Owner 2026-11-19: Show on map left the cards open over the map and framed only one town; a Charter is two towns
// joined by a road, so the camera must fit both.
describe("Show on map frames the whole charge", () => {
  it("centres between a Charter's two towns and zooms out until both are on screen", () => {
    const view = houseChargeFitView(road({ x: 8, y: 15 }, { x: 70, y: 22 }), seen, phone, 22);
    expect(view.x).toBeGreaterThan(30);
    expect(view.x).toBeLessThan(50);
    expect(view.zoom).toBeLessThan(22);
    expect(onScreen(view, 8, 15)).toBe(true);
    expect(onScreen(view, 70, 22)).toBe(true);
  });

  it("frames the shorter way round the wrapped world", () => {
    const view = houseChargeFitView(road({ x: 3, y: 10 }, { x: WORLD_WIDTH - 4, y: 10 }), seen, phone, 22);
    expect(view.x === 0 || view.x === WORLD_WIDTH - 1 || view.x < 3).toBe(true);
    expect(view.zoom).toBe(22);
  });

  it("never zooms in past where the player already is", () => {
    expect(houseChargeFitView(road({ x: 8, y: 15 }, { x: 10, y: 15 }), seen, phone, 18).zoom).toBe(18);
  });

  it("frames an unscouted town by its rough circle, never its exact tile", () => {
    const discs = houseChargeFitDiscs(road({ x: 8, y: 15 }, { x: 70, y: 22 }), (x) => x === 8);
    expect(discs[0]).toMatchObject({ x: 8, y: 15 });
    expect(discs[1]).not.toMatchObject({ x: 70, y: 22 });
    const view = houseChargeFitView(road({ x: 8, y: 15 }, { x: 70, y: 22 }), (x) => x === 8, phone, 22);
    expect(onScreen(view, discs[1]!.x, discs[1]!.y)).toBe(true);
  });

  it("closes the panel, highlights the charge and asks the HUD to close the screen under it", () => {
    const state = { camX: 300, camY: 300, camSubX: 0.4, camSubY: 0.2, zoom: 22, houseChargeFocusId: undefined as string | undefined, tiles: new Map([["8,15", {}], ["70,22", {}]]) } as never as Parameters<typeof showHouseChargeOnMap>[0];
    const closePanel = vi.fn();
    const charge = road({ x: 8, y: 15 }, { x: 70, y: 22 });
    showHouseChargeOnMap(state, charge, { wrapX: (x) => x, wrapY: (y) => y, requestViewRefresh: vi.fn(), closePanel, viewport: () => phone });
    expect(closePanel).toHaveBeenCalledOnce();
    expect(state.houseChargeFocusId).toBe(charge.id);
    expect(onScreen({ x: state.camX, y: state.camY, zoom: state.zoom }, 8, 15)).toBe(true);
    expect(onScreen({ x: state.camX, y: state.camY, zoom: state.zoom }, 70, 22)).toBe(true);
    expect([state.camSubX, state.camSubY]).toEqual([0, 0]);
    expect(takeHouseChargeMapShowRequest()).toBe(true);
    expect(takeHouseChargeMapShowRequest()).toBe(false);
  });
});
