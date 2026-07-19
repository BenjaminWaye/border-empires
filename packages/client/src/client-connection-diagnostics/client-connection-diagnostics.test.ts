import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDisconnectHistoryBundle, recordSocketDisconnect, snapshotDisconnectHistory, summarizeDisconnectHistory } from "./client-connection-diagnostics.js";

describe("client connection diagnostics", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
  });

  it("persists disconnect entries across calls so history survives a page reload", () => {
    recordSocketDisconnect("close", { code: 1000, reason: "", wasClean: true, connectionUptimeMs: 120_000, debugPayload: {} });
    recordSocketDisconnect("close", { code: 1006, reason: "", wasClean: false, connectionUptimeMs: 800, debugPayload: {} });

    const entries = snapshotDisconnectHistory();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.code).toBe(1000);
    expect(entries[1]?.code).toBe(1006);
    expect(entries[1]?.wasClean).toBe(false);
  });

  it("summarizes abnormal-close count and the shortest connection uptime (flapping signal)", () => {
    recordSocketDisconnect("close", { code: 1000, wasClean: true, connectionUptimeMs: 300_000, debugPayload: {} });
    recordSocketDisconnect("close", { code: 1006, wasClean: false, connectionUptimeMs: 500, debugPayload: {} });
    recordSocketDisconnect("error", { connectionUptimeMs: 250, debugPayload: {} });

    const summary = summarizeDisconnectHistory();
    expect(summary.totalRecorded).toBe(3);
    expect(summary.abnormalCount).toBe(2);
    expect(summary.shortestUptimeMs).toBe(250);
    expect(summary.recent).toHaveLength(3);
  });

  it("caps the persisted history so it can't grow without bound", () => {
    for (let i = 0; i < 40; i += 1) {
      recordSocketDisconnect("close", { code: 1006, connectionUptimeMs: i, debugPayload: {} });
    }
    expect(snapshotDisconnectHistory().length).toBeLessThanOrEqual(25);
  });

  it("builds a standalone downloadable bundle for the settings-panel button", () => {
    recordSocketDisconnect("close", { code: 1006, reason: "proxy timeout", wasClean: false, connectionUptimeMs: 400, debugPayload: {} });
    recordSocketDisconnect("close", { code: 1000, reason: "", wasClean: true, connectionUptimeMs: 60_000, debugPayload: {} });

    const bundle = buildDisconnectHistoryBundle(5_000);
    expect(bundle.capturedAtMs).toBe(5_000);
    expect(bundle.incidentId).toEqual(expect.stringContaining("disconnects-"));
    expect(bundle.totalRecorded).toBe(2);
    expect(bundle.abnormalCount).toBe(1);
    expect(bundle.entries).toHaveLength(2);
  });
});
