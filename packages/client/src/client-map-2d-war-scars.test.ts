import { describe, expect, it, vi } from "vitest";
import { drawWarScars2D } from "./client-map-2d-war-scars.js";
import type { Tile } from "./client-types.js";

// Records every canvas call by name; property writes are accepted silently.
const recordingCtx = () => {
  const calls: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => {
      if (key in target) return target[key];
      if (key === "createRadialGradient") return () => ({ addColorStop: vi.fn() });
      return (..._args: unknown[]) => { calls.push(key); };
    },
    set: (target, key: string, value) => { target[key] = value; return true; }
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};

const NOW = 1_000_000;
const tile = (warScarLevel: number, warScarUntil: number) => ({ x: 2, y: 3, terrain: "LAND", warScarLevel, warScarUntil }) as Tile;

describe("drawWarScars2D", () => {
  it("draws more the deeper the scars, and nothing once they fade", () => {
    const light = recordingCtx();
    drawWarScars2D(light.ctx, tile(1, NOW + 1), 0, 0, 40, NOW);
    const heavy = recordingCtx();
    drawWarScars2D(heavy.ctx, tile(5, NOW + 1), 0, 0, 40, NOW);
    expect(light.calls.length).toBeGreaterThan(0);
    expect(heavy.calls.length).toBeGreaterThan(light.calls.length * 2);
    const faded = recordingCtx();
    drawWarScars2D(faded.ctx, tile(5, NOW), 0, 0, 40, NOW);
    expect(faded.calls).toEqual([]);
  });
});
