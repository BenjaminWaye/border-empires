import { afterEach, expect, it, vi } from "vitest";
import { startRecurringTask } from "./recurring-task.js";

afterEach(() => vi.useRealTimers());
it("preserves immediate execution for existing recurring jobs", () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const task = startRecurringTask(run, 15000);
  expect(run).toHaveBeenCalledOnce();
  task.stop();
});
it("defers proactive diplomacy until the first interval instead of subscribing during auth startup", () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const task = startRecurringTask(run, 15000, { runImmediately: false });
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(14999);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(run).toHaveBeenCalledOnce();
  task.stop();
  vi.advanceTimersByTime(15000);
  expect(run).toHaveBeenCalledOnce();
});
it("cancels a deferred job before its first interval", () => {
  vi.useFakeTimers();
  const run = vi.fn();
  const task = startRecurringTask(run, 15000, { runImmediately: false });
  task.stop();
  vi.advanceTimersByTime(15000);
  expect(run).not.toHaveBeenCalled();
});
