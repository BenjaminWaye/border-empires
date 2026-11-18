import { describe, expect, it } from "vitest";
import type { ClientState } from "../client-state/client-state.js";
import { createDistrictCanvas } from "../client-town-district/district-canvas.js";
import { districtFixture } from "../client-town-district/district-fixtures.js";

// Exercise the 2D runtime adapter with live selection/hover changes, not just
// its drawing primitive or the lookup it shares with the 3D renderer.
describe("2D town plot selection", () => {
  it("shows empty plots only for the selected town area and updates amber hover/selection", () => {
    const fixture = districtFixture("MANUFACTORY");
    const state = {
      tiles: fixture.tiles, tilesRevision: 1, selected: undefined as ClientState["selected"],
      hover: undefined as ClientState["hover"], me: "p1", dormantStructures: [], camX: 100, camY: 100
    };
    const canvas = createDistrictCanvas({
      state, ctx: {} as CanvasRenderingContext2D, terrainAt: () => "LAND", visibilityAt: () => "visible",
      worldToScreen: (x, y) => ({ sx: x, sy: y })
    });
    expect(canvas.plots(false).size).toBe(0);
    state.selected = fixture.town;
    expect(canvas.plots(false).size).toBe(23); // 24 for Metropolis, minus its Manufactory
    expect(canvas.plots(true).size).toBe(0); // canvas never draws on top of the true-3D map
    state.hover = { x: 99, y: 99 };
    expect(canvas.plots(false).get("99,99")).toBe(true);
    expect(canvas.plots(false).get("100,99")).toBe(false);
    expect(canvas.plots(false).has("101,100")).toBe(false); // occupied
    state.selected = state.hover; state.hover = undefined;
    expect(canvas.plots(false).get("99,99")).toBe(true);
    state.selected = { x: 104, y: 104 };
    expect(canvas.plots(false).size).toBe(0);
    state.selected = fixture.town;
    fixture.town.town!.populationTier = "SETTLEMENT";
    expect(canvas.plots(false).size).toBe(0);
  });
});
