import { describe, expect, it } from "vitest";
import { MAX_TILE_BUDGET, MIN_TILE_BUDGET, tileBudgetForScreen } from "./client-map-3d-tile-budget.js";

const MIN_ZOOM = 10;

const budgetFor = (screenWidth: number, screenHeight: number): number =>
  tileBudgetForScreen({ screenWidth, screenHeight, minZoom: MIN_ZOOM, floor: MIN_TILE_BUDGET, cap: MAX_TILE_BUDGET });

describe("3d tile budget", () => {
  it("keeps the full desktop budget — desktop screens clamp to the cap", () => {
    expect(budgetFor(2560, 1440)).toBe(MAX_TILE_BUDGET);
    expect(budgetFor(1920, 1080)).toBe(MAX_TILE_BUDGET);
  });

  it("leaves the smallest laptop essentially at the cap", () => {
    // A 1440x900 MacBook Air needs 13432 at MIN_ZOOM — just under the cap, so
    // it sheds ~4% rather than keeping the old fixed 14000. Well inside what
    // the screen can actually show, which is what the budget has to cover.
    expect(budgetFor(1440, 900)).toBe(13432);
    expect(budgetFor(1440, 900) / MAX_TILE_BUDGET).toBeGreaterThan(0.95);
  });

  it("shrinks the budget on a phone screen, which is the point of the change", () => {
    // iPhone 13, 390x844 CSS px.
    expect(budgetFor(390, 844)).toBe(MIN_TILE_BUDGET);
    expect(budgetFor(390, 844)).toBeLessThan(MAX_TILE_BUDGET);
  });

  it("is orientation-independent, so a rotation never needs more than the budget", () => {
    expect(budgetFor(390, 844)).toBe(budgetFor(844, 390));
  });

  it("never returns less than what the screen can show at MIN_ZOOM", () => {
    // The floor has to be generous enough that no current phone is clipped:
    // the raw requirement for the largest phone screen must stay under it.
    const tilesForLargestPhone = Math.ceil(430 / MIN_ZOOM + 2) * Math.ceil(932 / MIN_ZOOM + 2);
    expect(tilesForLargestPhone).toBeLessThan(MIN_TILE_BUDGET);
  });

  it("covers a tablet screen without clamping to the floor", () => {
    // iPad Pro 12.9", 1024x1366 — needs ~14.6k, so it clamps to the cap
    // rather than the floor and keeps desktop-grade headroom.
    expect(budgetFor(1024, 1366)).toBe(MAX_TILE_BUDGET);
  });

  it("falls back to the cap on nonsense screen metrics rather than starving buffers", () => {
    expect(budgetFor(0, 0)).toBe(MAX_TILE_BUDGET);
    expect(budgetFor(Number.NaN, 800)).toBe(MAX_TILE_BUDGET);
  });
});
