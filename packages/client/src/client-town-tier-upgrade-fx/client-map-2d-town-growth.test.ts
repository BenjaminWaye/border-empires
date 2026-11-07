import { describe, expect, it, vi } from "vitest";
import { drawTownGrowthSprites2D, TOWN_GROWTH_STRIPS_2D, townSpriteRect } from "./client-map-2d-town-growth.js";
import { TOWN_GROWTH_TRANSITION_MS } from "./client-town-tier-upgrade-fx.js";

const sprite = { width: 120, height: 120 } as unknown as CanvasImageSource;
const upgrade = { x: 1, y: 1, fromTier: "TOWN", tier: "CITY", startedAt: 0 } as const;

describe("drawTownGrowthSprites2D", () => {
  it("draws nothing outside the transition or for another tier", () => {
    const ctx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    expect(drawTownGrowthSprites2D(ctx, upgrade, "CITY", () => sprite, 0, 0, 60, TOWN_GROWTH_TRANSITION_MS)).toBe(false);
    expect(drawTownGrowthSprites2D(ctx, upgrade, "GREAT_CITY", () => sprite, 0, 0, 60, 500)).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("rises in strips cut at the same scale as the sprite, so no strip is stretched", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    expect(drawTownGrowthSprites2D(ctx, upgrade, "CITY", () => sprite, 0, 0, 60, TOWN_GROWTH_TRANSITION_MS - 1)).toBe(true);
    const rect = townSpriteRect("CITY", 0, 0, 60);
    const strips = drawImage.mock.calls.filter((call) => call.length === 9);
    expect(strips).toHaveLength(TOWN_GROWTH_STRIPS_2D * 2);
    for (const [, sx, , sw, , , , dw] of strips) {
      if (sx + sw >= 120 - 1e-9) continue; // last strip is clipped to the sprite's edge
      expect(sw / dw).toBeCloseTo(120 / rect.size, 9);
    }
  });
});
