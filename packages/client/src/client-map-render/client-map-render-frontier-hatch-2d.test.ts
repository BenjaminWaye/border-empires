import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FRONTIER_HATCH } from "../client-map-3d-settled-edge-glow/client-map-3d-frontier-hatch.js";
import { createFrontierHatch2D, frontierHatchAlpha } from "./client-map-render-frontier-hatch-2d.js";
import { drawLiveOwnershipTint2D } from "./client-map-render-live-ownership-tint.js";

type Call = { op: string; alpha: number };
const recordingCtx = (): { ctx: CanvasRenderingContext2D; calls: Call[] } => {
  const calls: Call[] = [];
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillRect(): void { calls.push({ op: "fillRect", alpha: this.globalAlpha }); },
    drawImage(): void { calls.push({ op: "drawImage", alpha: this.globalAlpha }); },
    fill(): void {},
    save(): void {},
    restore(): void {},
    beginPath(): void {},
    rect(): void {},
    clip(): void {},
    arc(): void {},
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData(): void {}
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
};

class FakeOffscreenCanvas {
  private readonly ctx = recordingCtx().ctx;
  constructor(readonly width: number, readonly height: number) {}
  getContext(): CanvasRenderingContext2D { return this.ctx; }
}

afterEach(() => vi.unstubAllGlobals());

describe("frontier hatch (owner 2026-11-27: frontier blends into the ground)", () => {
  it("alternates stripe and gap opacity like the 3D shader, half the tile each", () => {
    const samples = 64;
    let stripe = 0;
    for (let y = 0; y < samples; y += 1) {
      for (let x = 0; x < samples; x += 1) {
        const a = frontierHatchAlpha((x + 0.5) / samples, (y + 0.5) / samples, DEFAULT_FRONTIER_HATCH);
        expect([DEFAULT_FRONTIER_HATCH.stripeOpacity, DEFAULT_FRONTIER_HATCH.gapOpacity]).toContain(a);
        if (a === DEFAULT_FRONTIER_HATCH.stripeOpacity) stripe += 1;
      }
    }
    // Texel-centre sampling lands some samples exactly on a stripe edge, so roughly half.
    expect(stripe / (samples * samples)).toBeGreaterThan(0.4);
    expect(stripe / (samples * samples)).toBeLessThan(0.6);
  });

  it("runs on across tile seams", () => {
    for (const v of [0.1, 0.37, 0.8]) {
      expect(frontierHatchAlpha(0.999, v, DEFAULT_FRONTIER_HATCH)).toBe(frontierHatchAlpha(-0.001, v, DEFAULT_FRONTIER_HATCH));
    }
  });

  it("draws a 2D frontier tile as baked stripes, not the old flat 0.2 wash", () => {
    // Regression: drawLiveOwnershipTint2D filled frontier with one flat 0.2 rect.
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const { ctx, calls } = recordingCtx();
    drawLiveOwnershipTint2D(ctx, { ownershipState: "FRONTIER" }, "#39ff14", 0, 0, 0, 0, 40, 0);
    expect(calls[0]).toEqual({ op: "drawImage", alpha: 1 });
    expect(calls.some((call) => call.op === "fillRect" && call.alpha === 0.2)).toBe(false);
  });

  it("falls back to the stripes' average opacity when tiles are too small to stripe", () => {
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
    const { ctx, calls } = recordingCtx();
    createFrontierHatch2D(DEFAULT_FRONTIER_HATCH).draw(ctx, "#39ff14", 0, 0, 8, 0.5);
    const average = (DEFAULT_FRONTIER_HATCH.stripeOpacity + DEFAULT_FRONTIER_HATCH.gapOpacity) / 2;
    expect(calls).toEqual([{ op: "fillRect", alpha: average * 0.5 }]);
  });
});
