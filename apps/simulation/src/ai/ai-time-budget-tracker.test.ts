import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiBudgetTracker, createPerPlayerAiBudgetTrackers } from "./ai-time-budget-tracker.js";

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

describe("perPlayerAiBudgetTrackers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tracks each player independently", () => {
    const trackers = createPerPlayerAiBudgetTrackers(["ai-1", "ai-2", "ai-3"]);

    expect(trackers.available("ai-1")).toBe(true);
    expect(trackers.available("ai-2")).toBe(true);
    expect(trackers.available("ai-3")).toBe(true);
    expect(trackers.totalUsedMs()).toBe(0);
  });

  it("records per-player work without affecting other players", () => {
    const trackers = createPerPlayerAiBudgetTrackers(["ai-1", "ai-2"]);

    trackers.recordWork("ai-1", 190);
    expect(trackers.available("ai-1")).toBe(true);
    expect(trackers.available("ai-2")).toBe(true);

    trackers.recordWork("ai-1", 20); // ai-1 now at 210ms → exhausted
    expect(trackers.available("ai-1")).toBe(false);
    expect(trackers.available("ai-2")).toBe(true); // ai-2 unaffected
  });

  it("returns false for unknown player", () => {
    const trackers = createPerPlayerAiBudgetTrackers(["ai-1"]);
    expect(trackers.available("ai-99")).toBe(false);
  });

  it("silently ignores work for unknown player", () => {
    const trackers = createPerPlayerAiBudgetTrackers(["ai-1"]);
    trackers.recordWork("ai-99", 999);
    expect(trackers.totalUsedMs()).toBe(0);
  });

  it("computes totalUsedMs across all players", () => {
    const trackers = createPerPlayerAiBudgetTrackers(["ai-1", "ai-2", "ai-3"]);

    trackers.recordWork("ai-1", 50);
    trackers.recordWork("ai-2", 30);
    trackers.recordWork("ai-3", 20);
    expect(trackers.totalUsedMs()).toBe(100);
  });

  it("a slow player does not starve other players", () => {
    const trackers = createPerPlayerAiBudgetTrackers(["ai-slow", "ai-fast"], 1_000, 200);

    // Slow player uses all its budget
    trackers.recordWork("ai-slow", 200);
    expect(trackers.available("ai-slow")).toBe(false);

    // Fast player still has full budget available
    expect(trackers.available("ai-fast")).toBe(true);
    trackers.recordWork("ai-fast", 199);
    expect(trackers.available("ai-fast")).toBe(true);
  });
});
