import { describe, expect, it } from "vitest";
import {
  MAX_TILE_BUDGET,
  MIN_TILE_BUDGET,
  clampedTileHalfExtents,
  tileBudgetForScreen,
  tileBudgetOverride
} from "./client-map-3d-tile-budget.js";

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

describe("tile budget override", () => {
  it("is absent unless asked for, so normal sessions use the computed budget", () => {
    expect(tileBudgetOverride("")).toBeUndefined();
    expect(tileBudgetOverride("?renderer=2d")).toBeUndefined();
  });

  it("lets a crashing device be walked down to a survivable budget", () => {
    expect(tileBudgetOverride("?tilebudget=2000")).toBe(2000);
    expect(tileBudgetOverride("?renderer=3d&tilebudget=500")).toBe(500);
  });

  it("clamps to a range that can still be tried, in both directions", () => {
    expect(tileBudgetOverride("?tilebudget=1")).toBe(200);
    expect(tileBudgetOverride("?tilebudget=999999")).toBe(60000);
  });

  it("ignores junk rather than allocating something nonsensical", () => {
    expect(tileBudgetOverride("?tilebudget=abc")).toBeUndefined();
  });
});

describe("clampedTileHalfExtents", () => {
  it("leaves the window untouched when it's already within budget", () => {
    expect(clampedTileHalfExtents(40, 20, MAX_TILE_BUDGET)).toEqual({ halfW: 40, halfH: 20 });
  });

  it("clamps an ultrawide desktop's MIN_ZOOM window to the 2D loop's per-frame budget", () => {
    // 3440x1440 at MIN_ZOOM (10 px/tile) naively wants ~50k tiles/frame —
    // this is the exact case from the laggy-panning trace this fix targets.
    const naiveHalfW = Math.floor(3440 / 10 / 2);
    const naiveHalfH = Math.floor(1440 / 10 / 2);
    const naiveTileCount = (2 * naiveHalfW + 1) * (2 * naiveHalfH + 1);
    expect(naiveTileCount).toBeGreaterThan(MAX_TILE_BUDGET);

    const { halfW, halfH } = clampedTileHalfExtents(naiveHalfW, naiveHalfH, MAX_TILE_BUDGET);
    const clampedTileCount = (2 * halfW + 1) * (2 * halfH + 1);
    expect(clampedTileCount).toBeLessThanOrEqual(MAX_TILE_BUDGET);
    expect(halfW).toBeLessThan(naiveHalfW);
    expect(halfH).toBeLessThan(naiveHalfH);
  });

  it("preserves the viewport aspect ratio instead of cropping one axis", () => {
    const { halfW, halfH } = clampedTileHalfExtents(200, 50, 4000);
    expect(halfW / halfH).toBeCloseTo(200 / 50, 0);
  });

  it("never collapses an axis to zero, even under an extreme budget", () => {
    const { halfW, halfH } = clampedTileHalfExtents(500, 500, 10);
    expect(halfW).toBeGreaterThanOrEqual(1);
    expect(halfH).toBeGreaterThanOrEqual(1);
  });
});
