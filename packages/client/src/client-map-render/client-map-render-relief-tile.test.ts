import { describe, expect, it } from "vitest";
import { drawReliefTerrainTile } from "./client-map-render-relief-tile.js";

const recordingContext = (): { ctx: CanvasRenderingContext2D; strokeRects: unknown[][] } => {
  const strokeRects: unknown[][] = [];
  const target: Record<string, unknown> = {
    strokeRect: (...args: unknown[]) => strokeRects.push(args),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined })
  };
  const ctx = new Proxy(target, {
    get: (t, key) => (key in t ? t[key as string] : () => undefined),
    set: (t, key, value) => { t[key as string] = value; return true; }
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, strokeRects };
};

describe("drawReliefTerrainTile", () => {
  it("draws no per-tile grid outline on land or sea", () => {
    for (const terrain of ["LAND", "SEA"] as const) {
      const { ctx, strokeRects } = recordingContext();
      drawReliefTerrainTile(ctx, { wx: 3, wy: 4, terrain, px: 10, py: 20, size: 32, cachedTerrainColorAt: () => "#445533", isLandAt: () => false }, undefined);
      expect(strokeRects).toEqual([]);
    }
  });
});
