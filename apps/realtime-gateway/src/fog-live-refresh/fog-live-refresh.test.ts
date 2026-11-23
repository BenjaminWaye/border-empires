import { describe, expect, it } from "vitest";
import { clearFogDisabledForRestore, createFogIntentTracker } from "./fog-live-refresh.js";

describe("fog intent tracker", () => {
  it("invalidates generations captured before a newer toggle", () => {
    const tracker = createFogIntentTracker();
    const liveRefreshGeneration = tracker.current("p1");
    const restoreGeneration = tracker.bump("p1");
    expect(tracker.isCurrent("p1", liveRefreshGeneration)).toBe(false);
    expect(tracker.isCurrent("p1", restoreGeneration)).toBe(true);
    expect(tracker.isCurrent("p2", 0)).toBe(true);
  });
});

describe("fog restore helpers", () => {
  it("clears fogDisabled on every socket and can restore each previous value", () => {
    const sessions = new Map([["a", { fogDisabled: true }], ["b", { fogDisabled: false }]]);
    const undo = clearFogDisabledForRestore(["a", "b", "gone"], (socket) => sessions.get(socket));
    expect([...sessions.values()].map((s) => s.fogDisabled)).toEqual([false, false]);
    undo();
    expect([...sessions.values()].map((s) => s.fogDisabled)).toEqual([true, false]);
  });
});
