import { describe, expect, it, vi } from "vitest";
import { drawAfc2D } from "../client-map-2d-afc-overlay.js";

const context = (): CanvasRenderingContext2D => {
  const ctx: Partial<CanvasRenderingContext2D> = {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    moveTo: vi.fn(), lineTo: vi.fn(), ellipse: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillRect: vi.fn(), strokeRect: vi.fn(), globalAlpha: 1
  };
  return ctx as CanvasRenderingContext2D;
};

describe("2D AFC tooling module", () => {
  it("draws the gantry on a docked tooling module, including inactive AFCs", () => {
    for (const status of ["active", "inactive"] as const) {
      const ctx = context();
      drawAfc2D(ctx, { x: 1, y: 1, afc: { ownerId: "me", status, modules: ["trade"] } }, 10, 20, 100, 0);
      expect(ctx.translate).toHaveBeenCalledWith(60, 98);
      expect(ctx.strokeRect).toHaveBeenCalled();
      expect(ctx.fillRect).toHaveBeenCalled();
    }
  });
  it("keeps the ordinary AFC glyph when tooling is absent", () => {
    const ctx = context();
    drawAfc2D(ctx, { x: 1, y: 1, afc: { ownerId: "me", status: "active", modules: ["masonry"] } }, 10, 20, 100, 0);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.translate).not.toHaveBeenCalled();
  });
});
