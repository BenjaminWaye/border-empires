import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createListenerWatchdog, resolveProbeHost, selfProbeHostForBindHost } from "./listener-watchdog.js";

describe("listener watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes wildcard bind hosts for self-probes", () => {
    expect(selfProbeHostForBindHost("0.0.0.0")).toBe("127.0.0.1");
    expect(selfProbeHostForBindHost("::")).toBe("127.0.0.1");
    expect(selfProbeHostForBindHost("127.0.0.1")).toBe("127.0.0.1");
  });

  it("prefers an explicit routable probe host when provided", () => {
    expect(resolveProbeHost("0.0.0.0", "fdaa::123")).toBe("fdaa::123");
    expect(resolveProbeHost("127.0.0.1", "10.0.0.8")).toBe("10.0.0.8");
  });

  it("trips unhealthy after consecutive probe failures", async () => {
    const unhealthy = vi.fn();
    const probe = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const watchdog = createListenerWatchdog({
      bindHost: "0.0.0.0",
      port: 50051,
      probeIntervalMs: 1000,
      probeTimeoutMs: 100,
      failureThreshold: 2,
      onUnhealthy: unhealthy,
      probe
    });

    watchdog.start();
    await vi.waitFor(() => {
      expect(watchdog.snapshot().consecutiveFailures).toBe(1);
    });
    expect(watchdog.snapshot().ok).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => {
      expect(watchdog.snapshot().ok).toBe(false);
    });
    expect(unhealthy).toHaveBeenCalledTimes(1);
    watchdog.stop();
  });

  it("recovers after a later successful probe", async () => {
    const probe = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue(undefined);
    const watchdog = createListenerWatchdog({
      bindHost: "127.0.0.1",
      port: 50051,
      probeIntervalMs: 1000,
      probeTimeoutMs: 100,
      failureThreshold: 2,
      probe
    });

    watchdog.start();
    await vi.waitFor(() => {
      expect(watchdog.snapshot().consecutiveFailures).toBe(1);
    });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => {
      expect(watchdog.snapshot().ok).toBe(true);
      expect(watchdog.snapshot().consecutiveFailures).toBe(0);
    });
    watchdog.stop();
  });
});
