import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe("sync environment diagnostics", () => {
  it("records bounded main-thread long tasks and reports observation/eviction", async () => {
    let callback: PerformanceObserverCallback | undefined;
    class Observer {
      static supportedEntryTypes = ["longtask"];
      constructor(cb: PerformanceObserverCallback) { callback = cb; }
      observe() {}
    }
    vi.stubGlobal("PerformanceObserver", Observer);
    const { initSyncDiagnostics, snapshotSyncDiagnostics } = await import("./client-sync-diagnostics.js");
    initSyncDiagnostics();
    const records = Array.from({ length: 125 }, (_, i) => ({ startTime: i * 100, duration: 75 }));
    // Only the getEntries surface is consumed by the observer callback.
    callback?.({ getEntries: () => records } as PerformanceObserverEntryList, {} as PerformanceObserver);
    expect(snapshotSyncDiagnostics()).toMatchObject({ longTaskSupported: true, longTaskSampleCount: 120, longTasksEvicted: 5 });
    expect(snapshotSyncDiagnostics().longTasks[0]?.durationMs).toBe(75);
  });

  it("explicitly reports unsupported observation", async () => {
    vi.stubGlobal("PerformanceObserver", undefined);
    const { initSyncDiagnostics, snapshotSyncDiagnostics } = await import("./client-sync-diagnostics.js");
    initSyncDiagnostics();
    expect(snapshotSyncDiagnostics()).toMatchObject({ longTaskSupported: false, longTaskSampleCount: 0 });
  });
});
