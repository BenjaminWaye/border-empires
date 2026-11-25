import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { renderTileSize, resetCanvasContext, runGuardedFrame, skippedDrawFrameCount, startGuardedDrawLoop } from "./client-render-frame-guard.js";

const fakeContext = () => ({
  setTransform: vi.fn(),
  setLineDash: vi.fn(),
  globalAlpha: 0.3,
  globalCompositeOperation: "screen" as GlobalCompositeOperation
});

afterEach(() => vi.restoreAllMocks());

describe("renderTileSize", () => {
  it("keeps the 2D tile size positive whatever state.zoom holds", () => {
    expect(renderTileSize(-133)).toBe(MIN_ZOOM);
    expect(renderTileSize(0)).toBe(MIN_ZOOM);
    expect(renderTileSize(Number.NaN)).toBe(MIN_ZOOM);
    expect(renderTileSize(10_000)).toBe(MAX_ZOOM);
    expect(renderTileSize(72)).toBe(72);
  });
});

// Playtest 2026-11-25: a negative arc radius thrown out of the draw loop put up the fatal error screen and the
// loop never rescheduled itself. One bad frame must be dropped, not take the whole client down.
describe("guarded draw loop", () => {
  it("skips a throwing frame, resets the canvas and keeps the loop going", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ctx = fakeContext();
    const scheduleNext = vi.fn();
    const before = skippedDrawFrameCount();

    expect(() =>
      runGuardedFrame(() => {
        throw new DOMException("The radius provided (-66.5) is negative.", "IndexSizeError");
      }, ctx, scheduleNext)
    ).not.toThrow();

    expect(scheduleNext).toHaveBeenCalledOnce();
    expect(skippedDrawFrameCount()).toBe(before + 1);
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("logs a repeating error once, not every frame", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwSame = (): void => {
      throw new Error("same frame error");
    };
    for (let i = 0; i < 5; i += 1) runGuardedFrame(throwSame, fakeContext(), () => undefined);
    expect(log).toHaveBeenCalledOnce();
  });

  it("leaves a healthy frame's own scheduling alone", () => {
    const draw = vi.fn();
    const scheduleNext = vi.fn();
    runGuardedFrame(draw, fakeContext(), scheduleNext);
    expect(draw).toHaveBeenCalledOnce();
    expect(scheduleNext).not.toHaveBeenCalled();
  });

  it("requests the first frame instead of drawing before the caller holds the frame callback", () => {
    const scheduled: Array<() => void> = [];
    const draw = vi.fn();
    const frame = startGuardedDrawLoop(draw, fakeContext(), (callback) => scheduled.push(callback));
    expect(draw).not.toHaveBeenCalled();
    expect(scheduled).toEqual([frame]);
    scheduled[0]!();
    expect(draw).toHaveBeenCalledOnce();
  });

  it("uses the context's own reset() when it has one", () => {
    const reset = vi.fn();
    const ctx = { ...fakeContext(), reset };
    resetCanvasContext(ctx);
    expect(reset).toHaveBeenCalledOnce();
    expect(ctx.setTransform).not.toHaveBeenCalled();
  });
});
