import { describe, expect, it } from "vitest";
import { canvasBackingSize, fitWorldRect, viewRectPieces, worldTileAtPoint } from "./client-world-map-geometry.js";

describe("world map geometry", () => {
  it("keeps the world's 2:1 shape, centred, on a phone-width canvas and a tall one", () => {
    expect(fitWorldRect(343, 171.5, 640, 320)).toEqual({ x: 0, y: 0, w: 343, h: 171.5 });
    expect(fitWorldRect(400, 400, 640, 320)).toEqual({ x: 0, y: 100, w: 400, h: 200 });
    expect(fitWorldRect(0, 100).w).toBe(0);
  });

  it("caps the canvas backing store with one scale, so a Retina laptop's 2:1 box stays 2:1", () => {
    // 1076x538 css px at pixel ratio 2 used to become 2048x1076 (width capped alone): the world drew squashed.
    const size = canvasBackingSize(1076, 538, 2, 2048);
    expect(size.w).toBe(2048);
    expect(size.w / size.h).toBeCloseTo(2, 2);
    expect(canvasBackingSize(343, 171.5, 3, 2048)).toEqual({ w: 1029, h: 515 });
    expect(canvasBackingSize(0, 100, 2, 2048)).toEqual({ w: 0, h: 0 });
  });

  it("finds the tile under a tap and nothing off the world", () => {
    const rect = { x: 0, y: 100, w: 400, h: 200 };
    expect(worldTileAtPoint(0, 100, rect, 640, 320)).toEqual({ x: 0, y: 0 });
    expect(worldTileAtPoint(200, 200, rect, 640, 320)).toEqual({ x: 320, y: 160 });
    expect(worldTileAtPoint(399.9, 299.9, rect, 640, 320)).toEqual({ x: 639, y: 319 });
    expect(worldTileAtPoint(200, 50, rect, 640, 320)).toBeUndefined();
    expect(worldTileAtPoint(200, 300, rect, 640, 320)).toBeUndefined();
  });

  it("outlines the view as one rectangle inside the world", () => {
    expect(viewRectPieces(100, 50, 20, 10, 640, 320)).toEqual([{ x: 90, y: 45, w: 20, h: 10 }]);
  });

  it("splits a view across the world's edge onto both sides, as the wrapped world shows it", () => {
    const pieces = viewRectPieces(2, 1, 20, 10, 640, 320);
    expect(pieces).toHaveLength(4);
    expect(pieces).toContainEqual({ x: 632, y: 316, w: 8, h: 4 });
    expect(pieces).toContainEqual({ x: 0, y: 0, w: 12, h: 6 });
    expect(pieces.reduce((sum, p) => sum + p.w * p.h, 0)).toBe(200);
  });

  it("caps a view wider than the world at the world", () => {
    expect(viewRectPieces(10, 10, 2000, 10, 640, 320)[0]).toEqual({ x: 0, y: 5, w: 640, h: 10 });
  });
});
