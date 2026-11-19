import { describe, expect, it } from "vitest";
import {
  createInitialWaystationOpenFxState, detectWaystationOpenings, expireWaystationOpenings, recordWaystationOpenings,
  waystationOpenPose, WAYSTATION_OPEN_FX_MAX, WAYSTATION_OPEN_TOTAL_MS
} from "./holo-crate-open-fx.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("waystation opening timeline", () => {
  it("unlocks, opens, then teleports straight out and is gone at 2.6 s", () => {
    const closed = waystationOpenPose(0);
    expect(closed).toMatchObject({ lock: 0, door: 0, core: 0, out: 0, alpha: 1, done: false });
    expect(waystationOpenPose(250).door).toBe(0); // the lock goes first
    expect(waystationOpenPose(500).lock).toBe(1);
    expect(waystationOpenPose(1100).door).toBeCloseTo(1, 5);
    const held = waystationOpenPose(1550);
    expect(held).toMatchObject({ lock: 1, core: 1, out: 0, alpha: 1, done: false });
    expect(held.glow).toBeGreaterThan(0.9);
    expect(waystationOpenPose(2100).out).toBeCloseTo(0.5, 5);
    expect(waystationOpenPose(WAYSTATION_OPEN_TOTAL_MS - 1).done).toBe(false);
    expect(waystationOpenPose(WAYSTATION_OPEN_TOTAL_MS)).toMatchObject({ alpha: 0, done: true });
  });
});

describe("detecting and recording openings", () => {
  const record = JSON.stringify({ activated: true });
  it("only fires for a dormant rig the viewer could see before the batch", () => {
    const tiles = new Map([
      ["1,1", { waystation: { activated: false } }],
      ["2,2", { waystation: { activated: false }, fogged: true }],
      ["3,3", {}],
      ["4,4", { waystation: { activated: false } }]
    ]);
    const found = detectWaystationOpenings(tiles, [
      { x: 1, y: 1, waystationJson: record },
      { x: 2, y: 2, waystationJson: record },
      { x: 3, y: 3, waystationJson: record },
      { x: 4, y: 4, waystationJson: JSON.stringify({ activated: false }) },
      { x: 4, y: 4, waystationJson: "not json" },
      { x: 4, y: 4 }
    ], keyFor);
    expect(found).toEqual([{ x: 1, y: 1 }]);
  });

  it("is bounded and forgets finished openings", () => {
    const state = createInitialWaystationOpenFxState();
    const many = Array.from({ length: WAYSTATION_OPEN_FX_MAX + 10 }, (_, i) => ({ x: i, y: 0 }));
    recordWaystationOpenings(state, many, keyFor, 1000);
    expect(state.waystationOpenFxByKey.size).toBe(WAYSTATION_OPEN_FX_MAX);
    expect(state.waystationOpenFxQueue).toHaveLength(WAYSTATION_OPEN_FX_MAX);
    expect(state.waystationOpenFxByKey.has(`${many.length - 1},0`)).toBe(true); // newest kept
    expireWaystationOpenings(state, 1000 + WAYSTATION_OPEN_TOTAL_MS);
    expect(state.waystationOpenFxByKey.size).toBe(WAYSTATION_OPEN_FX_MAX); // still held: never started
    for (const entry of state.waystationOpenFxByKey.values()) entry.startedAt = 1000;
    expireWaystationOpenings(state, 1000 + WAYSTATION_OPEN_TOTAL_MS);
    expect(state.waystationOpenFxByKey.size).toBe(0);
    expect(state.waystationOpenFxQueue).toHaveLength(0);
  });
});
