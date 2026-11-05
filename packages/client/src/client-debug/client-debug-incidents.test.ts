import { describe, expect, it, vi } from "vitest";

describe("sync incident retention", () => {
  it("preserves a warning's context after routine events evict the main ring", async () => {
    vi.resetModules();
    const { recordClientDebugEvent, snapshotClientDebugEvents, snapshotClientDebugIncidents } = await import("./client-debug.js");
    recordClientDebugEvent("info", "sync-wire", "wire-sent", { commandId: "slow-command" });
    const current = { commandId: "slow-command" };
    recordClientDebugEvent("info", "attack-sync", "action-accept-timeout", { current });
    const snapshot = snapshotClientDebugEvents();
    current.commandId = "changed-later";
    expect(snapshot.find((event) => event.event === "action-accept-timeout")?.payload.current).toEqual({ commandId: "slow-command" });
    recordClientDebugEvent("info", "sync-wire", "wire-received", { commandId: "slow-command", type: "ACTION_ACCEPTED" });
    for (let i = 0; i < 500; i += 1) recordClientDebugEvent("info", "routine", "tick", { i });
    expect(snapshotClientDebugEvents().some((e) => e.event === "action-accept-timeout")).toBe(false);
    const result = snapshotClientDebugIncidents();
    expect(result.timeoutCount).toBe(1);
    expect(result.debugEventsEvicted).toBeGreaterThan(0);
    expect(result.windows[0]?.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "action-accept-timeout", payload: { current: { commandId: "slow-command" } } }),
      expect.objectContaining({ event: "wire-received" })
    ]));
    for (let i = 0; i < 25; i += 1) recordClientDebugEvent("info", "attack-sync", "action-accept-timeout", { i });
    expect(snapshotClientDebugIncidents()).toMatchObject({ timeoutCount: 26, retainedCount: 20, evicted: 6 });
    expect(() => recordClientDebugEvent("info", "attack-sync", "action-accept-timeout", { uncloneable: () => undefined })).not.toThrow();
    expect(snapshotClientDebugIncidents().snapshotFailures).toBeGreaterThan(0);
    expect(snapshotClientDebugIncidents().windows.every((w) => w.events.length <= 120)).toBe(true);
  });
});
