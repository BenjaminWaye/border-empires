import { PerformanceObserver } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startGcPauseObserver } from "./gc-pause-observer.js";

afterEach(() => vi.restoreAllMocks());

describe("startGcPauseObserver", () => {
  it("observes gc entries until disconnected", () => {
    const observe = vi.spyOn(PerformanceObserver.prototype, "observe");
    const disconnect = vi.spyOn(PerformanceObserver.prototype, "disconnect");
    const handle = startGcPauseObserver(() => undefined);
    expect(observe).toHaveBeenCalledWith({ entryTypes: ["gc"], buffered: false });
    expect(disconnect).not.toHaveBeenCalled();
    handle.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("still returns a disposer when gc observation is unavailable", () => {
    vi.spyOn(PerformanceObserver.prototype, "observe").mockImplementation(() => {
      throw new Error("gc entries unavailable");
    });
    const handle = startGcPauseObserver(() => undefined);
    expect(() => handle.disconnect()).not.toThrow();
  });
});
