import { describe, expect, it, vi } from "vitest";
import {
  UNEXPLORED_STORM_EDGE_COLOR,
  buildUnexploredStormPixels,
  drawUnexploredStormEdge2D,
  drawUnexploredStormTile,
  isUnexploredCoastRing,
  unexploredBandDepth,
  unexploredCoastVisibleAt
} from "./client-unexplored-storm-2d.js";
import { UNEXPLORED_STORM_MID } from "./client-unexplored-storm-palette.js";

const SIZE = 256;
const pixel = (data: Uint8ClampedArray, x: number, y: number): number[] => {
  const i = (y * SIZE + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
};

describe("unexplored storm 2D texture", () => {
  const data = buildUnexploredStormPixels(SIZE);

  it("is warm iron smoke (the HUD's iron palette), not the old near-black void or a cool grey", () => {
    let sum = 0, red = 0, blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      red += data[i]!;
      blue += data[i + 2]!;
    }
    const mean = sum / (data.length / 4);
    // The original fill was #06090f (luma ~8).
    expect(mean).toBeGreaterThan(30);
    expect(red).toBeGreaterThan(blue * 1.15); // warm, not the cool grey that clashed
  });

  it("keeps the rain streaks faint: they read as rain, not diagonal hatching stripes", () => {
    // Same streak spacing as the texture: 45 lines across 256 px, along px - py.
    let onSum = 0, onCount = 0, offSum = 0, offCount = 0;
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const coord = ((x - y) / SIZE) * 45;
        const dist = Math.abs(coord - Math.round(coord));
        const [r, g, b] = pixel(data, x, y);
        const luma = (r! + g! + b!) / 3;
        if (dist < 0.04) { onSum += luma; onCount += 1; } else if (dist > 0.3) { offSum += luma; offCount += 1; }
      }
    }
    expect(offSum / offCount - onSum / onCount).toBeLessThan(4);
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

  it("classifies the fog's first ring from all 8 neighbours, diagonals included", () => {
    expect(isUnexploredCoastRing(() => false)).toBe(false);
    expect(isUnexploredCoastRing((ox, oy) => ox === 1 && oy === 1)).toBe(true);
    expect(isUnexploredCoastRing((ox, oy) => ox === 0 && oy === -1)).toBe(true);
    expect(unexploredCoastVisibleAt(4)).toBe(false);
    expect(unexploredCoastVisibleAt(40)).toBe(true);
  });

  it("leaves the ring's ground clear, drawing storm and brass edge only beyond the wavy line", () => {
    const { ctx, ops } = recordingCtx();
    drawUnexploredStormEdge2D(ctx, 5, 5, 0, 0, 40, (ox, oy) => ox === 0 && oy === -1);
    // tile clip + one "beyond this side's wave" clip
    expect(ops.filter((op) => op === "clip")).toHaveLength(2);
    expect(ops.filter((op) => op === "fillRect")).toHaveLength(2); // the storm + its lantern glow -- no wash
    expect(ops.indexOf("stroke")).toBeGreaterThan(ops.indexOf("fillRect"));
  });

  it("clips the storm outside a corner arc for diagonal-only contact", () => {
    const { ctx, ops } = recordingCtx();
    drawUnexploredStormEdge2D(ctx, 5, 5, 0, 0, 40, (ox, oy) => ox === 1 && oy === 1);
    expect(ops).toContain("arc");
    expect(ops.filter((op) => op === "clip")).toHaveLength(2);
  });

  it("shrouds most of the first fog tile, leaving a ~0.2-0.35 tile glimpse", () => {
    for (let a = 0; a < 4; a += 0.05) {
      const d = unexploredBandDepth(a, 7);
      expect(d).toBeGreaterThan(0.15);
      expect(d).toBeLessThan(0.4);
    }
  });
});
