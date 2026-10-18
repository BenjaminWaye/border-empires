import { describe, expect, it, vi } from "vitest";
import { DISABLED_AETHER_TOWER_ALPHA_2D, drawAetherTowerSprite2D } from "./client-aether-tower-sprite-2d.js";

const fakeCtx = () => {
  const drawAlphas: number[] = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    drawImage: vi.fn(() => drawAlphas.push(ctx.globalAlpha)),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn()
  };
  return { ctx, drawAlphas };
};

const loadedSprite = { complete: true, naturalWidth: 128 } as HTMLImageElement;

describe("drawAetherTowerSprite2D", () => {
  it("draws an active tower at full strength with its lens lit", () => {
    const { ctx, drawAlphas } = fakeCtx();
    const deps = { ctx: ctx as unknown as CanvasRenderingContext2D, sprite: loadedSprite, structureAccentColor: vi.fn() };
    drawAetherTowerSprite2D(deps, { status: "active" }, "me", 0, 0, 40);
    expect(drawAlphas).toEqual([1]);
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it("fades a disabled tower and shutters its aether lens", () => {
    const { ctx, drawAlphas } = fakeCtx();
    const deps = { ctx: ctx as unknown as CanvasRenderingContext2D, sprite: loadedSprite, structureAccentColor: vi.fn() };
    drawAetherTowerSprite2D(deps, { status: "inactive" }, "me", 0, 0, 40);
    expect(drawAlphas).toEqual([DISABLED_AETHER_TOWER_ALPHA_2D]);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });

  it("falls back to a dim accent ring when the sprite is not loaded", () => {
    const { ctx } = fakeCtx();
    const structureAccentColor = vi.fn((_owner: string, fallback: string) => fallback);
    const deps = { ctx: ctx as unknown as CanvasRenderingContext2D, sprite: undefined, structureAccentColor };
    drawAetherTowerSprite2D(deps, { status: "inactive" }, "me", 0, 0, 40);
    expect(structureAccentColor).toHaveBeenCalledWith("me", "rgba(122, 214, 255, 0.42)");
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});
