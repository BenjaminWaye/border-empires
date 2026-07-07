import { describe, expect, it } from "vitest";

import { createCommandApplyTracker } from "./command-apply-tracker.js";

describe("command apply tracker", () => {
  it("returns undefined for a command that resolves below the slow threshold", () => {
    let now = 1_000;
    const tracker = createCommandApplyTracker({ now: () => now, slowWarnMs: 300 });

    tracker.track("cmd-fast");
    now = 1_100;
    expect(tracker.resolve("cmd-fast", 20)).toBeUndefined();
  });

  it("returns a diagnostic with queue-wait/apply/total breakdown for a command over the threshold", () => {
    let now = 1_000;
    const tracker = createCommandApplyTracker({ now: () => now, slowWarnMs: 300 });

    tracker.track("cmd-slow");
    now = 1_500; // 500ms total submit-to-apply, 50ms of which was the apply itself
    const diagnostic = tracker.resolve("cmd-slow", 50);

    expect(diagnostic).toEqual({
      commandId: "cmd-slow",
      submittedAt: 1_000,
      queueWaitMs: 450,
      applyDurationMs: 50,
      totalSubmitToApplyMs: 500
    });
  });

  it("is a one-shot resolve — a second resolve for the same commandId returns undefined", () => {
    let now = 1_000;
    const tracker = createCommandApplyTracker({ now: () => now, slowWarnMs: 100 });

    tracker.track("cmd-once");
    now = 1_500;
    expect(tracker.resolve("cmd-once", 10)).toBeDefined();
    expect(tracker.resolve("cmd-once", 10)).toBeUndefined();
  });

  it("returns undefined for a commandId that was never tracked", () => {
    const tracker = createCommandApplyTracker({ slowWarnMs: 0 });
    expect(tracker.resolve("never-tracked", 0)).toBeUndefined();
  });

  it("bounds memory via FIFO eviction and counts evictions instead of growing unbounded", () => {
    const tracker = createCommandApplyTracker({ maxEntries: 2, slowWarnMs: 0 });

    tracker.track("a");
    tracker.track("b");
    expect(tracker.evictedTotal()).toBe(0);

    // "a" is the oldest tracked entry and should be evicted to make room for "c".
    tracker.track("c");
    expect(tracker.evictedTotal()).toBe(1);

    // "a" was evicted, so resolving it now finds nothing (orphaned, not a leak).
    expect(tracker.resolve("a", 0)).toBeUndefined();
    // "b" and "c" are both still tracked.
    expect(tracker.resolve("b", 0)).not.toBeUndefined();
    expect(tracker.resolve("c", 0)).not.toBeUndefined();
  });
});
