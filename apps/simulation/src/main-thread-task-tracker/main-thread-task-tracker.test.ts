import { describe, expect, it } from "vitest";
import { createMainThreadTaskTracker, type ActiveMainThreadTask } from "./main-thread-task-tracker.js";

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

  it("reports the current top-of-stack task via onActiveTaskChanged, surviving nested trackSync calls", () => {
    // Regression: an earlier draft of this callback fired an unconditional
    // "ended" event when ANY trackSync call finished, so an inner call
    // completing (e.g. reachTileKeysForPlayer inside planner_view_push)
    // would wrongly report "nothing active" while the outer phase was still
    // running. Death-forensics reading a stale "undefined" during a real
    // outer-phase stall would misreport the process as idle right when it
    // mattered most.
    let currentTime = 1_000;
    const changes: (ActiveMainThreadTask | undefined)[] = [];
    const tracker = createMainThreadTaskTracker({
      now: () => currentTime,
      minRetainedDurationMs: 0,
      onActiveTaskChanged: (task) => changes.push(task ? { ...task } : undefined)
    });

    tracker.trackSync("outer", undefined, () => {
      currentTime += 1;
      tracker.trackSync("inner", undefined, () => {
        currentTime += 1;
      });
      // The inner call has ended, but we're still inside the outer one.
      expect(changes[changes.length - 1]).toEqual({ phase: "outer", startedAtMs: 1_000 });
      currentTime += 1;
    });

    expect(changes).toEqual([
      { phase: "outer", startedAtMs: 1_000 },
      { phase: "inner", startedAtMs: 1_001 },
      { phase: "outer", startedAtMs: 1_000 },
      undefined
    ]);
  });
});
