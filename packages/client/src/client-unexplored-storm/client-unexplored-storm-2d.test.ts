import { describe, expect, it, vi } from "vitest";
import { UNEXPLORED_STORM_EDGE_COLOR, buildUnexploredStormPixels, drawUnexploredStormTile } from "./client-unexplored-storm-2d.js";
import { UNEXPLORED_STORM_MID } from "./client-unexplored-storm-palette.js";

const SIZE = 256;
const pixel = (data: Uint8ClampedArray, x: number, y: number): number[] => {
  const i = (y * SIZE + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

describe("unexplored storm 2D texture", () => {
  const data = buildUnexploredStormPixels(SIZE);

  it("is grey cloud, not the old near-black void", () => {
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    const mean = sum / (data.length / 4);
    // The previous fill was #06090f (luma ~8).
    expect(mean).toBeGreaterThan(60);
  });

  it("tiles seamlessly: the wrap seam is no rougher than any interior column step", () => {
    const columnStep = (x0: number, x1: number): number => {
      let diff = 0;
      for (let y = 0; y < SIZE; y += 1) diff += Math.abs(pixel(data, x0, y)[0]! - pixel(data, x1, y)[0]!);
      return diff / SIZE;
    };
    let interior = 0;
    for (let x = 0; x < SIZE - 1; x += 1) interior += columnStep(x, x + 1);
    interior /= SIZE - 1;
    expect(columnStep(SIZE - 1, 0)).toBeLessThan(interior * 2.5 + 1);
  });

  it("falls back to a solid storm fill when the canvas can't make patterns", () => {
    const fillRect = vi.fn();
    const ctx = { fillStyle: "", fillRect } as unknown as CanvasRenderingContext2D;
    drawUnexploredStormTile(ctx, 3, 4, 10, 20, 16);
    expect(fillRect).toHaveBeenCalledWith(10, 20, 16, 16);
  });

  it("hints the hidden tile's edges with faint lines, but not when tiles are tiny", () => {
    const calls: Array<[string, number[]]> = [];
    const ctx = {
      fillStyle: "",
      fillRect(...args: number[]) {
        calls.push([String(ctx.fillStyle), args]);
      }
    } as unknown as CanvasRenderingContext2D;
    drawUnexploredStormTile(ctx, 3, 4, 10, 20, 16);
    expect(calls[0]).toEqual([UNEXPLORED_STORM_MID, [10, 20, 16, 16]]);
    expect(calls.slice(1)).toEqual([
      [UNEXPLORED_STORM_EDGE_COLOR, [10, 20, 16, 1]],
      [UNEXPLORED_STORM_EDGE_COLOR, [10, 21, 1, 15]]
    ]);
    calls.length = 0;
    drawUnexploredStormTile(ctx, 3, 4, 10, 20, 4);
    expect(calls).toHaveLength(1);
  });
});
