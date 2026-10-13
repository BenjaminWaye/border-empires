import { describe, expect, it, vi } from "vitest";
import { drawCollectableYieldMarker } from "./client-map-render-collect-marker.js";
import { drawResourceCornerMarker } from "./client-map-render-resource-marker.js";

const recordingCtx = () => {
  const rects: Array<[number, number, number, number]> = [];
  const ctx = {
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => rects.push([x, y, w, h])),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    textBaseline: ""
  };
  return { rects, ctx: ctx as unknown as CanvasRenderingContext2D };
};

describe("drawCollectableYieldMarker", () => {
  it("sits in the top-right corner so it never covers the resource badge in the top-left", () => {
    const px = 100, py = 200, size = 64;
    const collect = recordingCtx();
    drawCollectableYieldMarker(collect.ctx, px, py, size, 0);
    const resource = recordingCtx();
    drawResourceCornerMarker(resource.ctx, { x: 0, y: 0, terrain: "LAND", resource: "FARM" }, px, py, size, () => "#e9f27b");

    const [cx, cy, cw, ch] = collect.rects[0]!;
    const [rx, ry, rw, rh] = resource.rects[0]!;
    expect(cx + cw).toBeLessThanOrEqual(px + size);
    expect(cx).toBeGreaterThan(px + size / 2);
    const overlaps = cx < rx + rw && rx < cx + cw && cy < ry + rh && ry < cy + ch;
    expect(overlaps).toBe(false);
  });
});
