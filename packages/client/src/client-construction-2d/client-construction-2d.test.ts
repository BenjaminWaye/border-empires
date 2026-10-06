import { describe, expect, it, vi } from "vitest";
import type { ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { drawConstructionAmbient2D, drawConstructionStructure2D } from "./client-construction-2d.js";

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
  afcOffset: undefined,
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

  it("draws the parts stack and the crew as the settle loader's dark pixel dots", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionStructure2D(ctx, image, 0, 0, 40, 1, site({ crew: 6 }), 0);
    // Crates plus one 2 px square per crew member.
    expect(raw.fillRect.mock.calls.length).toBeGreaterThanOrEqual(6 + 1);
    const dots = raw.fillRect.mock.calls.filter((c) => (c as unknown as number[])[2] === 2 && (c as unknown as number[])[3] === 2);
    expect(dots.length).toBeGreaterThanOrEqual(6);
    expect(raw.fillStyle).toBe("rgba(6, 8, 12, 0.9)"); // same colour as the settle dots
    expect(raw.strokeRect.mock.calls.every((c) => (c as unknown as number[])[2] !== 2)).toBe(true); // no outlined figures
  });

  it("skips crates and crew at tiny zoom but still shows the phase fill", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionStructure2D(ctx, image, 0, 0, 8, 1, site(), 0);
    expect(raw.clip).toHaveBeenCalledTimes(1);
    expect(raw.fillRect).not.toHaveBeenCalled();
  });

  it("moves the crew over time like the settle dots (pause-and-walk wander)", () => {
    const dotsAt = (nowMs: number): string => {
      const { ctx, raw } = fakeCtx();
      drawConstructionStructure2D(ctx, image, 0, 0, 40, 1, site({ crew: 8 }), nowMs);
      return JSON.stringify(raw.fillRect.mock.calls.filter((c) => (c as unknown as number[])[2] === 2));
    };
    const samples = new Set([0, 700, 1_400, 2_100, 2_800].map(dotsAt));
    expect(samples.size).toBeGreaterThan(1);
  });

  it("freezes the crew of a stalled build", () => {
    const dotsAt = (nowMs: number): string => {
      const { ctx, raw } = fakeCtx();
      drawConstructionStructure2D(ctx, image, 0, 0, 40, 1, site({ crew: 8, stalled: true }), nowMs);
      return JSON.stringify(raw.fillRect.mock.calls.filter((c) => (c as unknown as number[])[2] === 2));
    };
    expect(dotsAt(0)).toBe(dotsAt(1_700));
    expect(dotsAt(0)).toBe(dotsAt(5_000));
  });
});

describe("drawConstructionAmbient2D", () => {
  it("draws only the crates and crew, never the sprite or a clip", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionAmbient2D(ctx, 0, 0, 40, site({ crew: 3 }), 0);
    expect(raw.fillRect).toHaveBeenCalled();
    expect(raw.drawImage).not.toHaveBeenCalled();
    expect(raw.clip).not.toHaveBeenCalled();
  });

  it("is skipped at tiny zoom", () => {
    const { ctx, raw } = fakeCtx();
    drawConstructionAmbient2D(ctx, 0, 0, 8, site(), 0);
    expect(raw.fillRect).not.toHaveBeenCalled();
  });
});
