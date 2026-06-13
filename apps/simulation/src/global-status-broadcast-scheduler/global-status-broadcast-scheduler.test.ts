import { afterEach, describe, expect, it, vi } from "vitest";

import { createGlobalStatusBroadcastScheduler } from "./global-status-broadcast-scheduler.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createGlobalStatusBroadcastScheduler", () => {
  it("debounces multiple schedules into a single perform with the latest commandId", async () => {
    vi.useFakeTimers();
    const perform = vi.fn().mockResolvedValue(undefined);
    const scheduler = createGlobalStatusBroadcastScheduler({
      debounceMs: 100,
      perform,
      onCoalesced: vi.fn(),
      onError: vi.fn()
    });

    scheduler.schedule("a");
    scheduler.schedule("b");
    expect(perform).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledWith("b");
  });

  it("coalesces requests during an in-flight broadcast into one debounced re-run", async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const perform = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        release = resolve;
      }))
      .mockResolvedValue(undefined);
    const onCoalesced = vi.fn();
    const scheduler = createGlobalStatusBroadcastScheduler({
      debounceMs: 100,
      perform,
      onCoalesced,
      onError: vi.fn()
    });

    scheduler.schedule("a");
    await vi.advanceTimersByTimeAsync(100);
    expect(perform).toHaveBeenCalledTimes(1);

    // Requests arriving while the first export is in flight must coalesce, not stack.
    scheduler.schedule("b");
    scheduler.schedule("c");
    expect(onCoalesced).toHaveBeenCalledTimes(2);
    expect(perform).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(0); // let the finally re-arm the debounce timer
    await vi.advanceTimersByTimeAsync(100); // wait out the re-run debounce

    expect(perform).toHaveBeenCalledTimes(2);
    expect(perform).toHaveBeenLastCalledWith("c");
  });

  it("routes perform rejections to onError without throwing", async () => {
    vi.useFakeTimers();
    const error = new Error("export failed");
    const perform = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    const scheduler = createGlobalStatusBroadcastScheduler({
      debounceMs: 100,
      perform,
      onCoalesced: vi.fn(),
      onError
    });

    scheduler.schedule("a");
    await vi.advanceTimersByTimeAsync(100);

    expect(onError).toHaveBeenCalledWith(error);
  });

  it("dispose cancels a pending debounce timer", async () => {
    vi.useFakeTimers();
    const perform = vi.fn().mockResolvedValue(undefined);
    const scheduler = createGlobalStatusBroadcastScheduler({
      debounceMs: 100,
      perform,
      onCoalesced: vi.fn(),
      onError: vi.fn()
    });

    scheduler.schedule("a");
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(perform).not.toHaveBeenCalled();
  });
});
