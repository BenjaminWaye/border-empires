import { describe, expect, it, vi } from "vitest";
import { UNEXPLORED_STORM_EDGE_COLOR, buildUnexploredStormPixels, drawUnexploredStormEdge2D, drawUnexploredStormTile, unexploredBandDepth } from "./client-unexplored-storm-2d.js";
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

  const recordingCtx = () => {
    const ops: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) => key in target ? target[key] : (...args: unknown[]) => { ops.push(key); return key.startsWith("create") ? { addColorStop: () => undefined } : undefined; },
      set: (target, key: string, value) => { target[key] = value; return true; }
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, ops };
  };

  it("draws nothing on a fog tile with no explored neighbour", () => {
    const { ctx, ops } = recordingCtx();
    drawUnexploredStormEdge2D(ctx, 5, 5, 0, 0, 40, () => false);
    expect(ops).toEqual([]);
  });

  it("draws the parchment band and foam rim inside a fog tile facing explored land, and skips tiny tiles", () => {
    const { ctx, ops } = recordingCtx();
    drawUnexploredStormEdge2D(ctx, 5, 5, 0, 0, 40, (ox, oy) => ox === 0 && oy === -1);
    expect(ops).toContain("clip");
    expect(ops).toContain("fill");
    expect(ops).toContain("stroke");
    const tiny = recordingCtx();
    drawUnexploredStormEdge2D(tiny.ctx, 5, 5, 0, 0, 4, () => true);
    expect(tiny.ops).toEqual([]);
  });

  it("keeps the wavy band within ~0.1-0.3 tile of the explored edge", () => {
    for (let a = 0; a < 4; a += 0.05) {
      const d = unexploredBandDepth(a, 7);
      expect(d).toBeGreaterThan(0.06);
      expect(d).toBeLessThan(0.3);
    }
  });
});
