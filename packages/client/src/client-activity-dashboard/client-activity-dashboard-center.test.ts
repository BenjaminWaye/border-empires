// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { focusCameraOnTile } from "./client-activity-dashboard-center.js";

const makeDeps = () => ({
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  requestViewRefresh: vi.fn()
});

describe("focusCameraOnTile", () => {
  it("sets camera position, resets sub-pixel offset, selects the tile, and requests a view refresh", () => {
    const state = { camX: 0, camY: 0, camSubX: 5, camSubY: 5, selected: undefined as { x: number; y: number } | undefined };
    const deps = makeDeps();
    focusCameraOnTile(state, 12, 34, deps);
    expect(state).toMatchObject({ camX: 12, camY: 34, camSubX: 0, camSubY: 0, selected: { x: 12, y: 34 } });
    expect(deps.requestViewRefresh).toHaveBeenCalledTimes(1);
  });

  it("wraps coordinates through the supplied wrapX/wrapY (world-edge wraparound)", () => {
    const state = { camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined as { x: number; y: number } | undefined };
    const deps = { wrapX: (x: number) => x - 1000, wrapY: (y: number) => y + 1000, requestViewRefresh: vi.fn() };
    focusCameraOnTile(state, 5, 5, deps);
    expect(state.camX).toBe(-995);
    expect(state.camY).toBe(1005);
  });
});
