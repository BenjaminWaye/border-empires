import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { CORNER_BADGE_ICON_MIN_TILE_PX, drawCornerBadge } from "./client-map-render-corner-badge.js";

const recordingCtx = () => {
  const circles: Array<{ x: number; y: number; radius: number }> = [];
  const fills: string[] = [];
  const strokes: string[] = [];
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    beginPath: vi.fn(),
    arc(x: number, y: number, radius: number, start: number, end: number) {
      expect(start).toBe(0);
      expect(end).toBe(Math.PI * 2);
      circles.push({ x, y, radius });
    },
    fill() { fills.push(String(this.fillStyle)); },
    stroke() { strokes.push(String(this.strokeStyle)); },
    fillRect: vi.fn(), strokeRect: vi.fn()
  };
  return { circles, fills, strokes, raw: ctx, ctx: ctx as unknown as CanvasRenderingContext2D };
};

describe("drawCornerBadge", () => {
  it("draws coloured circular markers when zoomed out", () => {
    const { fills, strokes, raw, ctx } = recordingCtx();
    const drawIcon = vi.fn();
    drawCornerBadge(ctx, 0, 0, 22, "#e9f27b", drawIcon);
    expect(fills).toContain("#e9f27b");
    expect(strokes).toEqual([]);
    expect(raw.fillRect).not.toHaveBeenCalled();
    expect(drawIcon).not.toHaveBeenCalled();
  });

  it("keeps the small marker's existing footprint at maximum zoom-out", () => {
    const { circles, ctx } = recordingCtx();
    drawCornerBadge(ctx, 0, 0, 10, "#4d2a86", vi.fn());
    for (const circle of circles) {
      expect(circle.x - circle.radius).toBeGreaterThanOrEqual(0);
      expect(circle.x + circle.radius).toBeLessThanOrEqual(12);
    }
  });

  it.each([48, 64, 96])("keeps at least 20px of readable artwork inside a %spx tile", size => {
    const { ctx, circles, raw } = recordingCtx();
    const drawIcon = vi.fn();
    drawCornerBadge(ctx, 0, 0, size, "#c9c9c9", drawIcon);
    const [cx, cy, iconSize] = drawIcon.mock.calls[0] as [number, number, number];
    expect(iconSize).toBeGreaterThanOrEqual(20);
    expect(cx - iconSize / 2).toBeGreaterThanOrEqual(0);
    expect(cy - iconSize / 2).toBeGreaterThanOrEqual(0);
    expect(cx + iconSize / 2).toBeLessThanOrEqual(size);
    expect(cy + iconSize / 2).toBeLessThanOrEqual(size);
    expect(circles[0]).toMatchObject({ x: cx, y: cy });
    expect(raw.strokeRect).not.toHaveBeenCalled();
  });

  it.each([10, 14, 22, 36, 47, 48, 64, 96, 192])("keeps resource icons inside a %spx tile at every zoom", size => {
    const { ctx, circles, fills, strokes } = recordingCtx();
    const drawIcon = vi.fn();
    drawCornerBadge(ctx, 0, 0, size, "#c9c9c9", drawIcon, undefined, true);
    expect(drawIcon).toHaveBeenCalledTimes(1);
    const [cx, cy, iconSize] = drawIcon.mock.calls[0] as [number, number, number];
    expect(iconSize).toBeGreaterThanOrEqual(6);
    expect(fills).toEqual(["rgba(14, 12, 10, 0.88)"]);
    expect(strokes).toEqual(["#c9c9c9"]);
    for (const circle of circles) {
      expect(circle.x - circle.radius).toBeGreaterThanOrEqual(0);
      expect(circle.y - circle.radius).toBeGreaterThanOrEqual(0);
      expect(circle.x + circle.radius).toBeLessThanOrEqual(size);
      expect(circle.y + circle.radius).toBeLessThanOrEqual(size);
    }
    expect(cx - iconSize / 2).toBeGreaterThanOrEqual(0);
    expect(cy - iconSize / 2).toBeGreaterThanOrEqual(0);
    expect(cx + iconSize / 2).toBeLessThanOrEqual(size);
    expect(cy + iconSize / 2).toBeLessThanOrEqual(size);
  });

  it("draws a dark disc with a coloured circular rim at close zoom", () => {
    const { fills, strokes, circles, ctx } = recordingCtx();
    const drawIcon = vi.fn();
    drawCornerBadge(ctx, 0, 0, CORNER_BADGE_ICON_MIN_TILE_PX, "#c9c9c9", drawIcon);
    expect(circles).toHaveLength(2);
    expect(strokes).toEqual(["#c9c9c9"]);
    expect(fills).toEqual(["rgba(14, 12, 10, 0.88)"]);
    expect(drawIcon).toHaveBeenCalledTimes(1);
  });
});

it("ships the brass anchor SVG for dock medallions", () => {
  expect(existsSync(fileURLToPath(new URL("../../public/icons/simple/dock.svg", import.meta.url)))).toBe(true);
});
