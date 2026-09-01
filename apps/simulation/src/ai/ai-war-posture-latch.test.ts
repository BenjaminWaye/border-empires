import { describe, expect, it } from "vitest";

import { nextWarPostureLatch, WAR_POSTURE_EXIT_CLEAR_TICKS } from "./ai-war-posture-latch.js";

describe("nextWarPostureLatch", () => {
  it("enters WAR on a single tick of threat, from no prior state", () => {
    const next = nextWarPostureLatch(undefined, true);
    expect(next).toEqual({ active: true, clearTicks: 0 });
  });

  it("stays inactive when there is no threat and no prior latch", () => {
    const next = nextWarPostureLatch(undefined, false);
    expect(next.active).toBe(false);
  });

  it("resets clearTicks to 0 the instant threat reappears mid-countdown", () => {
    let state = nextWarPostureLatch(undefined, true);
    state = nextWarPostureLatch(state, false);
    state = nextWarPostureLatch(state, false);
    expect(state).toEqual({ active: true, clearTicks: 2 });
    state = nextWarPostureLatch(state, true);
    expect(state).toEqual({ active: true, clearTicks: 0 });
  });

  it("stays active through WAR_POSTURE_EXIT_CLEAR_TICKS - 1 threat-free ticks", () => {
    let state = nextWarPostureLatch(undefined, true);
    for (let i = 1; i < WAR_POSTURE_EXIT_CLEAR_TICKS; i += 1) {
      state = nextWarPostureLatch(state, false);
      expect(state.active).toBe(true);
    }
  });

  it("exits exactly on the WAR_POSTURE_EXIT_CLEAR_TICKS'th consecutive threat-free tick", () => {
    let state = nextWarPostureLatch(undefined, true);
    for (let i = 1; i < WAR_POSTURE_EXIT_CLEAR_TICKS; i += 1) {
      state = nextWarPostureLatch(state, false);
    }
    state = nextWarPostureLatch(state, false);
    expect(state).toEqual({ active: false, clearTicks: 0 });
  });
});
