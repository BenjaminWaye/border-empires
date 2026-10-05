import { describe, expect, it, vi } from "vitest";
import type { ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { drawConstructionStructure2D } from "./client-construction-2d.js";

// A recording stand-in for CanvasRenderingContext2D: only the calls the
// construction renderer makes.
const fakeCtx = () => {
  const calls: string[] = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    drawImage: vi.fn(() => calls.push("drawImage")),
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(() => calls.push("clip")),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(() => calls.push("strokeRect")),
    fillRect: vi.fn(() => calls.push("fillRect"))
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, raw: ctx, calls };
};

const image = { complete: true, naturalWidth: 64 } as unknown as HTMLImageElement;
const HOUR = 3_600_000;
const site = (over: Partial<ConstructionSite> = {}): ConstructionSite => ({
  x: 2,
  y: 3,
  direction: "build",
  field: "economicStructure",
  structureType: "FOUNDRY",
  ownerId: "me",
  fraction: 0.3,
  visibleBands: 2,
  phase: 1,
  startedAtMs: Date.now() - 2 * HOUR,
  completesAtMs: Date.now() + 6 * HOUR,
  crew: 3,
  stalled: false,
  nextPhaseAtMs: undefined,
  ...over
});

describe("drawConstructionStructure2D", () => {
  it("draws a faint blueprint sprite, then the built bands clipped from the bottom up", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionStructure2D(ctx, image, 100, 200, 40, 1, site({ visibleBands: 2 }), 0);
    expect(raw.drawImage).toHaveBeenCalledTimes(2);
    // Built height = half the sprite (2 of 4 bands), anchored to the bottom.
    expect(raw.rect).toHaveBeenCalledWith(100, 220, 40, 20);
    expect(raw.clip).toHaveBeenCalledTimes(1);
  });

  it("outlines the unbuilt part with a dashed box only while bands remain", () => {
    const partial = fakeCtx();
    drawConstructionStructure2D(partial.ctx, image, 0, 0, 40, 1, site({ visibleBands: 1 }), 0);
    expect(partial.raw.setLineDash).toHaveBeenCalled();
    const outlineRect = partial.raw.strokeRect.mock.calls[0] as unknown as number[];
    expect(outlineRect[3]).toBeGreaterThan(0);

    const complete = fakeCtx();
    drawConstructionStructure2D(complete.ctx, image, 0, 0, 40, 1, site({ visibleBands: 4 }), 0);
    expect(complete.raw.setLineDash).not.toHaveBeenCalled();
  });

  it("draws the parts stack and one square per crew member (plus rims)", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionStructure2D(ctx, image, 0, 0, 40, 1, site({ crew: 3 }), 0);
    // At least the crates and the 3 figures were filled.
    expect(raw.fillRect.mock.calls.length).toBeGreaterThanOrEqual(3 + 1);
    // Figures get a light rim so they read against dark terrain: crew strokeRects.
    expect(raw.strokeRect.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("skips crates and crew at tiny zoom but still shows the phase fill", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionStructure2D(ctx, image, 0, 0, 8, 1, site(), 0);
    expect(raw.clip).toHaveBeenCalledTimes(1);
    expect(raw.fillRect).not.toHaveBeenCalled();
  });

  it("moves the crew over time (the walk is animated)", () => {
    const at = (nowMs: number): number[][] => {
      const { ctx, raw } = fakeCtx();
      drawConstructionStructure2D(ctx, image, 0, 0, 40, 1, site({ crew: 2 }), nowMs);
      return raw.fillRect.mock.calls.map((c) => [...(c as unknown as number[])]);
    };
    expect(at(0)).not.toEqual(at(1_000));
  });
});
