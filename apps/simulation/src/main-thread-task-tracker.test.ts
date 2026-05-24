import { describe, expect, it } from "vitest";
import { createMainThreadTaskTracker } from "./main-thread-task-tracker.js";

describe("main thread task tracker", () => {
  it("retains completed sync tasks that overlap a later event-loop block window", () => {
    let currentTime = 1_000;
    const tracker = createMainThreadTaskTracker({
      now: () => currentTime,
      minRetainedDurationMs: 1
    });

    tracker.trackSync("runtime_submit_command", { commandId: "cmd-1" }, () => {
      currentTime = 34_500;
    });

    expect(tracker.recentSince(1_100, 34_600)).toEqual([
      {
        phase: "runtime_submit_command",
        startedAtMs: 1_000,
        endedAtMs: 34_500,
        durationMs: 33_500,
        active: false,
        details: { commandId: "cmd-1" }
      }
    ]);
  });

  it("omits short completed tasks so routine spans do not crowd diagnostics", () => {
    let currentTime = 1_000;
    const tracker = createMainThreadTaskTracker({
      now: () => currentTime,
      minRetainedDurationMs: 25
    });

    tracker.trackSync("short_task", undefined, () => {
      currentTime = 1_010;
    });

    expect(tracker.recentSince(900, 1_100)).toEqual([]);
  });
});
