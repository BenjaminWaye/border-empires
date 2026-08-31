import { describe, expect, it, vi } from "vitest";
import { drawSelectedDockSeaRoute2D } from "./client-dock-route-draw.js";
import type { DockPair } from "./client-types.js";

const makeCtx = (): CanvasRenderingContext2D => {
  const ctx: Partial<CanvasRenderingContext2D> = {
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    lineDashOffset: 0,
    strokeStyle: "",
    lineWidth: 0
  };
  return ctx as CanvasRenderingContext2D;
};

const pair: DockPair = { ax: 1, ay: 1, bx: 3, by: 1 };
const route = [
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 }
];

describe("drawSelectedDockSeaRoute2D", () => {
  it("draws a stroke per route segment when the pairing is selected and visible", () => {
    const ctx = makeCtx();
    drawSelectedDockSeaRoute2D({
      ctx,
      canvas: { width: 800, height: 600 },
      dockPairs: [pair],
      selected: { x: 1, y: 1 },
      size: 32,
      halfW: 10,
      halfH: 10,
      nowMs: 0,
      isDockRouteVisibleForPlayer: () => true,
      resolveDockSeaRoute: () => route,
      worldToScreen: (wx, wy) => ({ sx: wx * 32, sy: wy * 32 })
    });
    expect(ctx.stroke).toHaveBeenCalledTimes(route.length - 1);
  });

  it("draws nothing when the pairing is not selected", () => {
    const ctx = makeCtx();
    drawSelectedDockSeaRoute2D({
      ctx,
      canvas: { width: 800, height: 600 },
      dockPairs: [pair],
      selected: { x: 99, y: 99 },
      size: 32,
      halfW: 10,
      halfH: 10,
      nowMs: 0,
      isDockRouteVisibleForPlayer: () => true,
      resolveDockSeaRoute: () => route,
      worldToScreen: (wx, wy) => ({ sx: wx * 32, sy: wy * 32 })
    });
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("draws nothing when the route is not visible for the player", () => {
    const ctx = makeCtx();
    drawSelectedDockSeaRoute2D({
      ctx,
      canvas: { width: 800, height: 600 },
      dockPairs: [pair],
      selected: { x: 1, y: 1 },
      size: 32,
      halfW: 10,
      halfH: 10,
      nowMs: 0,
      isDockRouteVisibleForPlayer: () => false,
      resolveDockSeaRoute: () => route,
      worldToScreen: (wx, wy) => ({ sx: wx * 32, sy: wy * 32 })
    });
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
