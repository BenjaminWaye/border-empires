import { describe, expect, it } from "vitest";
import { createUnexploredRevealTracker, UNEXPLORED_REVEAL_2D_MS } from "./client-unexplored-reveal-2d.js";

describe("unexplored reveal tracker (2D)", () => {
  it("animates a tile only when it goes from unexplored to explored", () => {
    const tracker = createUnexploredRevealTracker();
    expect(tracker.observe("1,1", true, 0)).toBeUndefined();
    expect(tracker.observe("1,1", false, 100)).toBe(0);
    expect(tracker.observe("1,1", false, 100 + UNEXPLORED_REVEAL_2D_MS / 2)).toBeCloseTo(0.5, 5);
    expect(tracker.observe("1,1", false, 100 + UNEXPLORED_REVEAL_2D_MS)).toBeUndefined(); // done
    expect(tracker.observe("1,1", false, 100 + UNEXPLORED_REVEAL_2D_MS * 2)).toBeUndefined();
  });

  it("never animates a tile first seen already explored (initial draw, panning onto known land)", () => {
    const tracker = createUnexploredRevealTracker();
    expect(tracker.observe("5,5", false, 0)).toBeUndefined();
    expect(tracker.observe("5,5", false, 50)).toBeUndefined();
  });

  it("stays bounded: the oldest tracked tiles are evicted past the cap", () => {
    const tracker = createUnexploredRevealTracker(100);
    for (let i = 0; i < 1000; i += 1) tracker.observe(`${i},0`, true, 0);
    expect(tracker.size()).toBeLessThanOrEqual(100);
  });
});
