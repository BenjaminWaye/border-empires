import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchPaced } from "./client-paced-bulk-dispatch.js";

describe("dispatchPaced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the immediate burst synchronously, with no timers involved", () => {
    const sent: number[] = [];
    dispatchPaced([1, 2, 3], (n) => sent.push(n), { immediateBurst: 3, intervalMs: 250 });
    expect(sent).toEqual([1, 2, 3]);
  });

  it("sends only the burst amount immediately when there are more items than the burst size", () => {
    const sent: number[] = [];
    dispatchPaced([1, 2, 3, 4, 5], (n) => sent.push(n), { immediateBurst: 2, intervalMs: 250 });
    expect(sent).toEqual([1, 2]);
  });

  it("drips the remaining items out at the configured interval instead of bursting them all", () => {
    const sent: number[] = [];
    dispatchPaced([1, 2, 3, 4], (n) => sent.push(n), { immediateBurst: 2, intervalMs: 250 });
    expect(sent).toEqual([1, 2]);

    vi.advanceTimersByTime(249);
    expect(sent).toEqual([1, 2]);

    vi.advanceTimersByTime(1);
    expect(sent).toEqual([1, 2, 3]);

    vi.advanceTimersByTime(250);
    expect(sent).toEqual([1, 2, 3, 4]);
  });

  it("never exceeds a rate the gateway rate limiter (5 tokens/sec) would reject, for a large bulk selection", () => {
    const sentAtMs: number[] = [];
    const items = Array.from({ length: 200 }, (_, i) => i);
    let now = 0;
    const originalSetTimeout = globalThis.setTimeout;
    vi.stubGlobal("setTimeout", ((cb: () => void, ms: number) => originalSetTimeout(() => { now += ms; cb(); }, 0)) as typeof setTimeout);

    dispatchPaced(items, () => sentAtMs.push(now), { immediateBurst: 15, intervalMs: 250 });
    vi.runAllTimers();

    // Refill is 5/sec == 200ms/token; our 250ms spacing after the burst stays under that rate.
    for (let i = 16; i < sentAtMs.length; i++) {
      const current = sentAtMs[i];
      const previous = sentAtMs[i - 1];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      expect((current ?? 0) - (previous ?? 0)).toBeGreaterThanOrEqual(200);
    }
  });
});
