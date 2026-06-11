import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiBudgetTracker } from "./ai-time-budget-tracker.js";

describe("aiBudgetTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is available when empty", () => {
    const tracker = createAiBudgetTracker();
    expect(tracker.available()).toBe(true);
    expect(tracker.usedMs()).toBe(0);
  });

  it("is available when work is under budget", () => {
    const tracker = createAiBudgetTracker();
    tracker.recordWork(50);
    tracker.recordWork(50);
    tracker.recordWork(99); // 199ms total — under 200ms budget
    expect(tracker.available()).toBe(true);
    expect(tracker.usedMs()).toBe(199);
  });

  it("becomes unavailable when cumulative work reaches budget", () => {
    const tracker = createAiBudgetTracker();
    tracker.recordWork(100);
    tracker.recordWork(100); // 200ms — exactly at budget, not available
    expect(tracker.available()).toBe(false);
    expect(tracker.usedMs()).toBe(200);
  });

  it("becomes unavailable after budget is exceeded", () => {
    const tracker = createAiBudgetTracker();
    tracker.recordWork(150);
    tracker.recordWork(100); // 250ms — over budget
    expect(tracker.available()).toBe(false);
    expect(tracker.usedMs()).toBe(250);
  });

  it("becomes available again after the window slides past old entries", () => {
    const tracker = createAiBudgetTracker(1_000, 200);

    // Record 200ms of work at t=0
    tracker.recordWork(100);
    tracker.recordWork(100);
    expect(tracker.available()).toBe(false);
    expect(tracker.usedMs()).toBe(200);

    // Advance 1.1s — all entries should be purged
    vi.advanceTimersByTime(1_100);
    expect(tracker.available()).toBe(true);
    expect(tracker.usedMs()).toBe(0);
  });

  it("purges only entries older than the window, keeping recent work", () => {
    const tracker = createAiBudgetTracker(1_000, 200);

    // Record 100ms at t=0
    tracker.recordWork(100);

    // Advance 600ms and record another 100ms
    vi.advanceTimersByTime(600);
    tracker.recordWork(100);
    expect(tracker.available()).toBe(false); // 200ms total, still in window
    expect(tracker.usedMs()).toBe(200);

    // Advance another 500ms (1100ms from start). First entry is 1100ms old → purged.
    // Second entry is 500ms old → kept. Budget should be 100ms.
    vi.advanceTimersByTime(500);
    expect(tracker.available()).toBe(true);
    expect(tracker.usedMs()).toBe(100);
  });

  it("respects custom window and budget", () => {
    const tracker = createAiBudgetTracker(500, 50);

    tracker.recordWork(30);
    tracker.recordWork(25); // 55ms, exceeds 50ms budget
    expect(tracker.available()).toBe(false);
    expect(tracker.usedMs()).toBe(55);

    // Advance past 500ms window
    vi.advanceTimersByTime(600);
    expect(tracker.available()).toBe(true);
    expect(tracker.usedMs()).toBe(0);
  });

  it("accumulates usedMs to match recorded work", () => {
    const tracker = createAiBudgetTracker();

    tracker.recordWork(42);
    expect(tracker.usedMs()).toBe(42);

    tracker.recordWork(18);
    expect(tracker.usedMs()).toBe(60);

    tracker.recordWork(7);
    expect(tracker.usedMs()).toBe(67);
  });
});
