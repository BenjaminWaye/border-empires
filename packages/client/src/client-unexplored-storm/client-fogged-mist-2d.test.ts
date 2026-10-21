import { describe, expect, it, vi } from "vitest";
import { FOGGED_MIST_HAZE, FOGGED_MIST_MAX_OPACITY, FOGGED_MIST_MIN_OPACITY } from "./client-unexplored-storm-palette.js";
import { buildFoggedMistPixels, clipFoggedEdge2D, drawFoggedMist2D, strokeFoggedEdge2D } from "./client-fogged-mist-2d.js";

const makeCtx = () => {
  const ctx = {
    fillStyle: "" as unknown, strokeStyle: "", globalAlpha: 1, lineWidth: 1,
    fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), stroke: vi.fn(), arc: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() }))
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx };
};

describe("fogged mist (2D)", () => {
  it("builds a translucent texture between the haze and wisp opacities", () => {
    const pixels = buildFoggedMistPixels(32);
    const alphas = Array.from(pixels).filter((_, k) => k % 4 === 3);
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(Math.floor(FOGGED_MIST_MIN_OPACITY * 255));
    expect(Math.max(...alphas)).toBeLessThanOrEqual(Math.ceil(FOGGED_MIST_MAX_OPACITY * 255));
    expect(new Set(alphas).size).toBeGreaterThan(4); // wisps, not a flat fill
  });

  it("falls back to a flat haze where canvas patterns aren't available", () => {
    const { ctx, raw } = makeCtx();
    drawFoggedMist2D(ctx, 3, 4, 10, 20, 40, 1000);
    expect(raw.fillRect).toHaveBeenCalledWith(10, 20, 40, 40);
    expect(raw.fillStyle).toBe(FOGGED_MIST_HAZE);
  });

  it("starts the fog a wavy band in from a side in sight, and nowhere else", () => {
    const { ctx, raw } = makeCtx();
    const edges = clipFoggedEdge2D(ctx, 3, 4, 0, 0, 40, (ox, oy) => ox === 0 && oy === -1);
    expect(edges).toHaveLength(1);
    expect(raw.clip).toHaveBeenCalledTimes(2); // the tile square, then past the band
    // The band's wave sits ~a quarter tile in from the top side, never on it.
    const ys = raw.lineTo.mock.calls.slice(0, 8).map(([, y]) => y as number);
    expect(Math.min(...ys)).toBeGreaterThan(40 * 0.15);
    expect(Math.max(...ys)).toBeLessThan(40 * 0.4);
    strokeFoggedEdge2D(ctx, edges, 40);
    expect(raw.stroke).toHaveBeenCalled();
  });

  it("rounds a diagonal-only contact with an arc", () => {
    const { ctx, raw } = makeCtx();
    const edges = clipFoggedEdge2D(ctx, 3, 4, 0, 0, 40, (ox, oy) => ox === 1 && oy === 1);
    expect(edges).toHaveLength(1);
    expect(raw.arc).toHaveBeenCalledWith(40, 40, expect.any(Number), 0, Math.PI * 2);
  });
});
