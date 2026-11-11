import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { computeMiniMapViewBox, unwrapIntoBox, wrappedAxisExtent } from "./client-minimap-view-box.js";
import { drawWrappedWorldImage, miniMapBoxPoint } from "./client-minimap-tile-layer.js";

const tilesAt = (coords: Array<[number, number]>): Map<string, Tile> =>
  new Map(coords.map(([x, y]) => [`${x},${y}`, { x, y, terrain: "LAND" } as Tile]));

const boxFor = (coords: Array<[number, number]>) =>
  computeMiniMapViewBox({ tiles: tilesAt(coords), fogDisabled: false, canvasW: 400, canvasH: 400 });

describe("minimap view box", () => {
  it("frames land on both sides of the world's left/right edge together, not the whole world width", () => {
    // Explored land around x = 630..639 and x = 0..9: one area across the seam, 20 tiles wide.
    const coords: Array<[number, number]> = [];
    for (let x = WORLD_WIDTH - 10; x < WORLD_WIDTH; x += 1) coords.push([x, 100]);
    for (let x = 0; x < 10; x += 1) coords.push([x, 110]);
    const box = boxFor(coords);
    expect(box.w).toBeLessThan(80);
    // Every explored tile lands inside the frame, near its middle rather than squeezed to its sides.
    for (const [x, y] of coords) {
      const at = miniMapBoxPoint(x, y, box);
      expect(at).toBeDefined();
      const fx = (at!.x - box.x0) / box.w;
      expect(fx).toBeGreaterThan(0.1);
      expect(fx).toBeLessThan(0.9);
    }
  });

  it("frames land on both sides of the world's top/bottom edge together", () => {
    const box = boxFor([
      [200, WORLD_HEIGHT - 3],
      [205, 2]
    ]);
    expect(box.h).toBeLessThan(80);
    expect(miniMapBoxPoint(200, WORLD_HEIGHT - 3, box)).toBeDefined();
    expect(miniMapBoxPoint(205, 2, box)).toBeDefined();
  });

  it("keeps a plain frame for land away from the edges", () => {
    const box = boxFor([
      [300, 150],
      [320, 160]
    ]);
    expect(box.x0).toBeGreaterThan(250);
    expect(box.x0 + box.w).toBeLessThan(WORLD_WIDTH);
    expect(box.y0 + box.h).toBeLessThan(WORLD_HEIGHT);
  });

  it("finds the shortest stretch of a wrapped axis", () => {
    const ring = new Uint8Array(10);
    ring[8] = ring[9] = ring[0] = ring[1] = 1;
    expect(wrappedAxisExtent(ring)).toEqual({ start: 8, span: 4 });
    expect(wrappedAxisExtent(new Uint8Array(10))).toBeUndefined();
    expect(unwrapIntoBox(3, 630, WORLD_WIDTH)).toBe(WORLD_WIDTH + 3);
  });

  it("draws a whole-world image across the seam in two pieces from each side of the image", () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...args: unknown[]) => calls.push(args.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const image = { width: WORLD_WIDTH, height: WORLD_HEIGHT } as HTMLCanvasElement;
    drawWrappedWorldImage(ctx, image, { x0: WORLD_WIDTH - 10, y0: 0, w: 20, h: 20 }, 200, 200);
    expect(calls).toEqual([
      [WORLD_WIDTH - 10, 0, 10, 20, 0, 0, 100, 200],
      [0, 0, 10, 20, 100, 0, 100, 200]
    ]);
  });
});

describe("minimap view box over the whole world", () => {
  it("keeps the world's own edge at the frame's edge once every column and row is explored", () => {
    const coords: Array<[number, number]> = [];
    for (let x = 0; x < WORLD_WIDTH; x += 1) coords.push([x, x % WORLD_HEIGHT]);
    for (let y = 0; y < WORLD_HEIGHT; y += 1) coords.push([0, y]);
    expect(boxFor(coords)).toEqual({ x0: 0, y0: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT });
    const full = new Uint8Array(10).fill(1);
    expect(wrappedAxisExtent(full)).toEqual({ start: 0, span: 10 });
  });

  it("starts a whole-world frame on a whole tile, so no strip of a tile is left unpainted", () => {
    // A very wide canvas widens the frame past the world's width, centred on a fractional point.
    const box = computeMiniMapViewBox({ tiles: tilesAt([[0, 100], [320, 101]]), fogDisabled: false, canvasW: 10_001, canvasH: 100 });
    expect(box.w).toBe(WORLD_WIDTH);
    expect(Number.isInteger(box.x0)).toBe(true);
  });
});
