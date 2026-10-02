import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMapPrep, describeMapPrep } from "./client-map-prep.js";
import { DEFAULT_STAGE_MS, readStageEstimates, recordStageDuration } from "./client-map-prep-estimate.js";
import type { MapPrepState } from "./client-map-prep-stages.js";

// Regression: after the world download the login overlay froze on one line for
// 10s+ while the 3D map was built in a single blocking task. Each build stage
// must now be announced (and painted) before it runs.

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value)
  };
};

describe("map prep", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("announces each stage, renders it and waits for a paint before the stage's work runs", async () => {
    let clock = 1_000;
    const state: { mapPrep: MapPrepState | null } = { mapPrep: null };
    const rendered: string[] = [];
    let paints = 0;
    const prep = createMapPrep({
      state,
      now: () => clock,
      render: () => rendered.push(state.mapPrep?.stage ?? "none"),
      waitForPaint: async () => {
        paints += 1;
      }
    });

    await prep.onStage("graphics");
    expect(state.mapPrep).toMatchObject({ stage: "graphics", index: 0, startedAt: 1_000 });
    clock = 4_000;
    await prep.onStage("terrain");
    clock = 5_000;
    prep.finish();

    expect(rendered).toEqual(["graphics", "terrain", "none"]);
    expect(paints).toBe(2);
    expect(state.mapPrep).toBeNull();
    // Measured stage durations become this device's estimates.
    expect(readStageEstimates().graphics).toBe(3_000);
    expect(readStageEstimates().terrain).toBe(1_000);
  });

  it("blends later measurements with the stored one and leaves unmeasured stages at their defaults", () => {
    recordStageDuration("shaders", 4_000);
    recordStageDuration("shaders", 2_000);
    expect(readStageEstimates().shaders).toBe(3_000);
    expect(readStageEstimates().firstFrame).toBe(DEFAULT_STAGE_MS.firstFrame);
  });

  it("finish is a no-op when no prep is running", () => {
    const state: { mapPrep: MapPrepState | null } = { mapPrep: null };
    const render = vi.fn();
    createMapPrep({ state, render }).finish();
    expect(render).not.toHaveBeenCalled();
  });

  it("describes the step, step count, bar position and time left", () => {
    const prep: MapPrepState = { stage: "structures", index: 2, startedAt: 0, stageStartedAt: 10_000 };
    const view = describeMapPrep(prep, 11_000, DEFAULT_STAGE_MS);
    expect(view.title).toBe("Placing towns and structures...");
    // 2.5s structures - 1s elapsed + 2s shaders + 3s first frame = 6.5s.
    expect(view.detail).toBe("Step 3 of 5. About 7s left.");
    expect(view.percent).toBe(40);
  });
});
