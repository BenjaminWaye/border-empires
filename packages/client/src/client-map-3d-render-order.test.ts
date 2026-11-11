import { Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createOwnershipOverlay } from "./client-map-3d-ownership-overlay.js";
import { FOG_OVERLAY_RENDER_ORDERS, RENDER_ORDER } from "./client-map-3d-render-order.js";

describe("surface overlay render order", () => {
  it("draws river water above the ownership fill but below fog-darken and markers", () => {
    // Decision 4 (docs/rivers-remake-plan.md): territory tint stops at the
    // waterline, and fog still darkens a river like the ground. Water used to
    // draw at the ocean's 12, above fog -- rivers stayed bright inside fog.
    expect(RENDER_ORDER.ownershipSettled).toBeLessThan(RENDER_ORDER.riverWater);
    expect(RENDER_ORDER.ownershipFrontier).toBeLessThan(RENDER_ORDER.riverWater);
    expect(RENDER_ORDER.riverWater).toBeLessThan(RENDER_ORDER.fogDarkenSettled);
    expect(RENDER_ORDER.riverWater).toBeLessThan(RENDER_ORDER.fogDarkenFrontier);
    expect(RENDER_ORDER.fogDarkenFrontier).toBeLessThan(RENDER_ORDER.selectedMarker);
    expect(RENDER_ORDER.selectedMarker).toBeLessThan(RENDER_ORDER.hoverMarker);
  });

  it("draws ground names above every ownership tint, live and fogged, but under the mist and markers", () => {
    // Realm names used to sit at 8.5, under the fog layers' last-known owner
    // tint (9/10), which washed them out over remembered territory.
    for (const tint of [RENDER_ORDER.ownershipSettled, RENDER_ORDER.ownershipFrontier, FOG_OVERLAY_RENDER_ORDERS.settled, FOG_OVERLAY_RENDER_ORDERS.frontier, RENDER_ORDER.riverWater]) {
      expect(RENDER_ORDER.groundNames).toBeGreaterThan(tint);
    }
    expect(RENDER_ORDER.groundNames).toBeLessThan(RENDER_ORDER.foggedMist);
    expect(RENDER_ORDER.groundNames).toBeLessThan(RENDER_ORDER.selectedMarker);
  });

  it("ownership overlays default to the ownership slots; fog overlays take their own", () => {
    const orders = (scene: Scene): number[] =>
      scene.children.filter((c): c is Mesh => c instanceof Mesh).map((m) => m.renderOrder).sort((a, b) => a - b);
    const live = new Scene();
    createOwnershipOverlay(live, 4);
    expect(orders(live)).toEqual([6, 6, 7, 7]);
    const fog = new Scene();
    createOwnershipOverlay(fog, 4, { settled: 0.65, frontier: 0.65 }, undefined, { settled: "multiply", frontier: "multiply" }, FOG_OVERLAY_RENDER_ORDERS);
    expect(orders(fog)).toEqual([9, 9, 10, 10]);
  });
});
