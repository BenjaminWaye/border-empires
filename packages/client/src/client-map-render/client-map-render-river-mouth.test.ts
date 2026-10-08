import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { drawRiverMouth2D } from "./client-map-render-river-mouth.js";

type Gradient = { x: number; y: number; r: number; stops: [number, string][] };
const recordingCtx = (): { ctx: CanvasRenderingContext2D; gradients: Gradient[]; fills: number } => {
  const gradients: Gradient[] = [];
  const state = { fills: 0 };
  const ctx = {
    fillStyle: "" as unknown,
    createRadialGradient: (_x0: number, _y0: number, _r0: number, x: number, y: number, r: number) => {
      const g: Gradient = { x, y, r, stops: [] };
      gradients.push(g);
      return { addColorStop: (at: number, color: string): void => void g.stops.push([at, color]) };
    },
    save: (): void => undefined,
    restore: (): void => undefined,
    beginPath: (): void => undefined,
    rect: (): void => undefined,
    clip: (): void => undefined,
    fillRect: (): void => void (state.fills += 1)
  };
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    gradients,
    get fills() {
      return state.fills;
    }
  };
};

describe("2D river mouth (parity with the 3D mouth plume)", () => {
  it("washes river water out from a mouth corner over the sea tile, fading to nothing", () => {
    // Regression: the 2D river band stopped dead at the sea tile's edge.
    const rec = recordingCtx();
    // Sea tile (5, 5) at (100, 200), 40px; the river meets the sea at its top-left corner (5, 5).
    drawRiverMouth2D(rec.ctx, 5, 5, 100, 200, 40, 40, new Set([5 * WORLD_WIDTH + 5]));
    expect(rec.gradients).toHaveLength(1);
    expect(rec.gradients[0]).toMatchObject({ x: 100, y: 200 });
    expect(rec.gradients[0]!.r).toBeGreaterThan(20);
    const stops = rec.gradients[0]!.stops;
    expect(stops[0]![1]).toMatch(/0\.95\)$/);
    expect(stops[stops.length - 1]![1]).toMatch(/, 0\)$/);
    expect(rec.fills).toBe(1);
  });

  it("draws nothing on a sea tile with no mouth on its corners", () => {
    const rec = recordingCtx();
    drawRiverMouth2D(rec.ctx, 5, 5, 100, 200, 40, 40, new Set([9 * WORLD_WIDTH + 9]));
    expect(rec.fills).toBe(0);
  });
});
