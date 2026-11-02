import { describe, expect, it, vi } from "vitest";
import { drawWarScars2D } from "./client-map-2d-war-scars.js";
import type { Tile } from "./client-types.js";

const fakeCtx = () => {
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt"
  };
  return ctx as typeof ctx & CanvasRenderingContext2D;
};

const NOW = 1_000_000;
const tile = (warScarLevel: number, warScarUntil: number) => ({ x: 2, y: 3, terrain: "LAND", warScarLevel, warScarUntil }) as Tile;

describe("drawWarScars2D", () => {
  it("draws more scorch marks the deeper the scars, and nothing once they fade", () => {
    const light = fakeCtx();
    drawWarScars2D(light, tile(1, NOW + 1), 0, 0, 40, NOW);
    const heavy = fakeCtx();
    drawWarScars2D(heavy, tile(4, NOW + 1), 0, 0, 40, NOW);
    expect(heavy.arc.mock.calls.length).toBeGreaterThan(light.arc.mock.calls.length);
    expect(light.arc).toHaveBeenCalled();
    const faded = fakeCtx();
    drawWarScars2D(faded, tile(4, NOW), 0, 0, 40, NOW);
    expect(faded.save).not.toHaveBeenCalled();
  });
});
