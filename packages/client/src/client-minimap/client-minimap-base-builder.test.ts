import { describe, expect, it } from "vitest";
import { createMiniMapBaseBuilder } from "./client-minimap-base-builder.js";

// Regression: the minimap base (worldgen for every minimap pixel) was built in
// one task inside the post-login INIT handler. It must now be built in slices.

const manualScheduler = () => {
  const queue: Array<() => void> = [];
  return {
    schedule: (callback: () => void) => void queue.push(callback),
    runNext: () => queue.shift()?.(),
    pending: () => queue.length
  };
};

describe("createMiniMapBaseBuilder", () => {
  it("builds every row across several tasks, then completes once", () => {
    const scheduler = manualScheduler();
    let clock = 0;
    const built: number[] = [];
    let completions = 0;
    const builder = createMiniMapBaseBuilder({
      rowCount: () => 10,
      buildRows: (from) => {
        built.push(from);
        clock += 5; // each row "costs" 5ms against an 8ms slice budget
      },
      onComplete: () => (completions += 1),
      schedule: scheduler.schedule,
      now: () => clock
    });

    builder.start();
    expect(built).toEqual([]); // nothing runs inside start()
    let tasks = 0;
    while (scheduler.pending() > 0) {
      scheduler.runNext();
      tasks += 1;
    }
    expect(built).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(tasks).toBe(5); // two rows per slice
    expect(completions).toBe(1);
    expect(builder.isBuilding()).toBe(false);
  });

  it("abandons an in-progress build when restarted", () => {
    const scheduler = manualScheduler();
    let clock = 0;
    const built: number[] = [];
    let completions = 0;
    const builder = createMiniMapBaseBuilder({
      rowCount: () => 4,
      buildRows: (from) => {
        built.push(from);
        clock += 10;
      },
      onComplete: () => (completions += 1),
      schedule: scheduler.schedule,
      now: () => clock
    });
    builder.start();
    scheduler.runNext(); // row 0
    builder.start(); // e.g. a new world seed arrived
    while (scheduler.pending() > 0) scheduler.runNext();
    expect(built).toEqual([0, 0, 1, 2, 3]);
    expect(completions).toBe(1);
  });
});
