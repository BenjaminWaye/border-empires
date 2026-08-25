import { describe, expect, it } from "vitest";
import { Color } from "three";
import { createFrontierDecayPulseTracker } from "./client-map-3d-frontier-decay-pulse.js";
import type { OwnershipOverlay } from "./client-map-3d-ownership-overlay.js";

const fakeOverlay = (): OwnershipOverlay & { calls: Array<{ index: number; color: Color }> } => {
  const calls: Array<{ index: number; color: Color }> = [];
  return {
    calls,
    settledMesh: undefined as never,
    frontierMesh: undefined as never,
    clear: () => undefined,
    addTile: () => -1,
    addHillTile: () => -1,
    beginFrontierColorUpdates: () => undefined,
    setFrontierTileColor: (index, color) => {
      calls.push({ index, color: color.clone() });
    },
    setFrontierHillTileColor: () => undefined,
    commit: () => undefined,
    dispose: () => undefined
  };
};

describe("frontier decay pulse tracker", () => {
  // Regression for the bug where the decay pulse was baked into the terrain
  // mesh inside a camera-pan-triggered rebuild, sampling Date.now() at
  // rebuild time -- panning the camera made the animation jump/restart.
  // render() must instead recompute purely from the nowMs argument, with no
  // dependency on when track()/reset() were last called.
  it("produces a different color across two render() calls at different nowMs, with no rebuild in between", () => {
    const tracker = createFrontierDecayPulseTracker();
    const overlay = fakeOverlay();
    const baseColor = new Color(1, 1, 1);

    tracker.track({ index: 0, isHill: false, frontierDecayAt: 100_000, frontierDecayKind: "OUT_OF_REACH", baseColor });

    tracker.render(0, overlay);
    tracker.render(500, overlay); // quarter of the 2000ms pulse period -- must land at a different blink phase

    expect(overlay.calls).toHaveLength(2);
    expect(overlay.calls[0]!.color.equals(overlay.calls[1]!.color)).toBe(false);
  });

  it("skips a tile once its decay window has fully elapsed, without needing reset()/track() again", () => {
    const tracker = createFrontierDecayPulseTracker();
    const overlay = fakeOverlay();
    tracker.track({ index: 0, isHill: false, frontierDecayAt: 1_000, frontierDecayKind: "OUT_OF_REACH", baseColor: new Color(1, 1, 1) });

    tracker.render(500, overlay); // still within the decay window
    expect(overlay.calls).toHaveLength(1);

    tracker.render(5_000, overlay); // well past frontierDecayAt
    expect(overlay.calls).toHaveLength(1); // no new call appended
  });

  it("clears tracked tiles on reset()", () => {
    const tracker = createFrontierDecayPulseTracker();
    const overlay = fakeOverlay();
    tracker.track({ index: 0, isHill: false, frontierDecayAt: 100_000, frontierDecayKind: "OUT_OF_REACH", baseColor: new Color(1, 1, 1) });

    tracker.reset();
    tracker.render(0, overlay);

    expect(overlay.calls).toHaveLength(0);
  });
});
