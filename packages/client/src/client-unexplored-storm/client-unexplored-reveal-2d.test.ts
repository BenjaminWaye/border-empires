import { describe, expect, it } from "vitest";
import { createUnexploredRevealTracker, UNEXPLORED_REVEAL_2D_MS } from "./client-unexplored-reveal-2d.js";

describe("unexplored reveal tracker (2D)", () => {
  it("animates a tile only when it goes from unexplored to explored", () => {
    const tracker = createUnexploredRevealTracker();
    expect(tracker.observe("0,0", false, 0)).toBeUndefined(); // the map already shows explored land
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

  it("doesn't play the reveal over the whole map on login or reconnect, before the first chunk lands", () => {
    const tracker = createUnexploredRevealTracker();
    // Before any chunk: every tile reads as unexplored.
    expect(tracker.observe("1,1", true, 0)).toBeUndefined();
    expect(tracker.observe("2,2", true, 0)).toBeUndefined();
    // The first chunk lands: known land shows up explored -- no fade.
    expect(tracker.observe("1,1", false, 500)).toBeUndefined();
    expect(tracker.observe("2,2", true, 500)).toBeUndefined();
    // Later exploring a tile that was still unexplored does fade.
    expect(tracker.observe("2,2", false, 5_000)).toBe(0);
  });

  it("stays bounded: the oldest tracked tiles are evicted past the cap", () => {
    const tracker = createUnexploredRevealTracker(100);
    for (let i = 0; i < 1000; i += 1) tracker.observe(`${i},0`, true, 0);
    expect(tracker.size()).toBeLessThanOrEqual(100);
  });
});
