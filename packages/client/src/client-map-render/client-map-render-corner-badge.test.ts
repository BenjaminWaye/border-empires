import { describe, expect, it, vi } from "vitest";
import { CORNER_BADGE_ICON_MIN_TILE_PX, drawCornerBadge } from "./client-map-render-corner-badge.js";

const recordingCtx = () => {
  const fills: Array<{ style: string; rect: [number, number, number, number] }> = [];
  const strokes: string[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    fillRect(x: number, y: number, w: number, h: number) { fills.push({ style: String(this.fillStyle), rect: [x, y, w, h] }); },
    strokeRect() { strokes.push(String(this.strokeStyle)); }
  };
  return { fills, strokes, ctx: ctx as unknown as CanvasRenderingContext2D };
};

describe("drawCornerBadge", () => {
  it("draws a solid square in the resource colour when zoomed out, so resources read by colour", () => {
    const { fills, strokes, ctx } = recordingCtx();
    const drawIcon = vi.fn();
    drawCornerBadge(ctx, 0, 0, 22, "#e9f27b", drawIcon);
    expect(fills.map((f) => f.style)).toContain("#e9f27b");
    expect(strokes).toEqual([]);
    expect(drawIcon).not.toHaveBeenCalled();
  });

  it("stays inside the tile at maximum zoom-out (10px tiles)", () => {
    const { fills, ctx } = recordingCtx();
    drawCornerBadge(ctx, 0, 0, 10, "#4d2a86", vi.fn());
    const colour = fills.find((f) => f.style === "#4d2a86")!;
    expect(colour.rect[0] + colour.rect[2]).toBeLessThanOrEqual(12);
  });

  it("switches to the icon on a dark plate with a coloured rim once tiles are big enough", () => {
    const { fills, strokes, ctx } = recordingCtx();
    const drawIcon = vi.fn();
    drawCornerBadge(ctx, 0, 0, CORNER_BADGE_ICON_MIN_TILE_PX, "#c9c9c9", drawIcon);
    expect(strokes).toEqual(["#c9c9c9"]);
    expect(fills.map((f) => f.style)).not.toContain("#c9c9c9");
    expect(drawIcon).toHaveBeenCalledTimes(1);
  });
});
