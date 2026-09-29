import { describe, expect, it } from "vitest";
import { winChancePaintColorForTile2D } from "./client-map-render-2d-combat-overlays.js";

describe("winChancePaintColorForTile2D", () => {
  it("returns undefined when no paint is armed", () => {
    expect(winChancePaintColorForTile2D(undefined, 5, 5)).toBeUndefined();
  });

  it("returns undefined for a tile outside the armed entries", () => {
    const paint = { targetX: 5, targetY: 5, expiresAt: Date.now() + 1000, entries: [{ x: 5, y: 5, winChance: 0.5, color: "#abc" }] };
    expect(winChancePaintColorForTile2D(paint, 9, 9)).toBeUndefined();
  });

  it("returns the entry's color for a tile it covers", () => {
    const paint = { targetX: 5, targetY: 5, expiresAt: Date.now() + 1000, entries: [{ x: 6, y: 4, winChance: 0.7, color: "#def" }] };
    expect(winChancePaintColorForTile2D(paint, 6, 4)).toBe("#def");
  });
});
