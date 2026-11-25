// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import { closeUpOn, dropCloseUp, glideProgress, TOWN_ZOOM } from "./client-hud-v2-camera.js";

const cameraDeps = (zoom: number) => ({
  state: { camX: 50, camY: 60, camSubX: 0, camSubY: 0, zoom },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  requestViewRefresh: vi.fn()
});

afterEach(() => {
  dropCloseUp();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Playtest 2026-11-25 (2D, old phone): opening a just-captured town from the Towns tab crashed the client with
// "Failed to execute 'arc' ... The radius provided (-66.5) is negative". The close-up glide's first rAF frame
// carried a timestamp from before the tap's performance.now(), so t < 0, ease(t) << 0 and state.zoom -- the 2D
// tile size -- went negative.
describe("town close-up zoom glide", () => {
  it("never drives the zoom out of range when the first frame's timestamp predates the glide start", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const deps = cameraDeps(22);

    closeUpOn(deps as never, 10, 10, TOWN_ZOOM);
    // A slow tap handler: the frame began 200ms before the glide read the clock.
    frames.shift()!(800);

    expect(deps.state.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(deps.state.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(deps.state.zoom).toBe(22);
  });

  it("still lands on the close-up level", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    const deps = cameraDeps(22);

    closeUpOn(deps as never, 10, 10, TOWN_ZOOM);
    frames.shift()!(1_100);
    expect(deps.state.zoom).toBeGreaterThan(22);
    expect(deps.state.zoom).toBeLessThan(TOWN_ZOOM);
    frames.shift()!(2_000);
    expect(deps.state.zoom).toBe(TOWN_ZOOM);
  });

  it("keeps glide progress inside [0, 1]", () => {
    expect(glideProgress(800, 1_000)).toBe(0);
    expect(glideProgress(1_000, 1_000)).toBe(0);
    expect(glideProgress(99_999, 1_000)).toBe(1);
  });
});
