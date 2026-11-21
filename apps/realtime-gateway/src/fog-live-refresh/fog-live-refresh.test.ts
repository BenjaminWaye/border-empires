import { describe, expect, it, vi } from "vitest";
import { clearFogDisabledForRestore, createFogIntentTracker, createFogLiveRefreshScheduler, resolveFogLiveRefreshMinGapMs, type FogLiveRefreshSchedulerDeps } from "./fog-live-refresh.js";

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

const harness = (overrides: Partial<FogLiveRefreshSchedulerDeps> = {}) => {
  let clock = 0;
  const sleeps: number[] = [];
  const refreshes: Array<{ playerId: string; commandId: string; at: number }> = [];
  let fogDisabled = true;
  const deps: FogLiveRefreshSchedulerDeps = {
    minGapMs: 15_000,
    hasFogDisabledSocket: () => fogDisabled,
    refresh: async (playerId, commandId) => { refreshes.push({ playerId, commandId, at: clock }); clock += 10_000; },
    onRefreshFailed: vi.fn(),
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    now: () => clock,
    ...overrides
  };
  return { deps, scheduler: createFogLiveRefreshScheduler(deps), sleeps, refreshes, setFogDisabled: (v: boolean) => { fogDisabled = v; } };
};

describe("fog intent tracker", () => {
  it("invalidates generations captured before a newer toggle", () => {
    const tracker = createFogIntentTracker();
    const liveRefreshGeneration = tracker.current("p1");
    const restoreGeneration = tracker.bump("p1");
    expect(tracker.isCurrent("p1", liveRefreshGeneration)).toBe(false);
    expect(tracker.isCurrent("p1", restoreGeneration)).toBe(true);
    expect(tracker.isCurrent("p2", 0)).toBe(true);
  });
});

describe("fog live refresh scheduler", () => {
  it("runs the first refresh immediately and spaces the next one from when the previous finished", async () => {
    const gate = deferred();
    const h = harness();
    const refresh = h.deps.refresh;
    h.deps.refresh = async (playerId, commandId) => { await refresh(playerId, commandId); if (h.refreshes.length === 1) await gate.promise; };
    const scheduler = createFogLiveRefreshScheduler(h.deps);
    scheduler.schedule("p1", "c1");
    scheduler.schedule("p1", "c2");
    scheduler.schedule("p1", "c3");
    gate.resolve();
    await scheduler.inflight("p1");
    // c1 at t=0 finishes at t=10s; the coalesced c3 waits the full 15s gap.
    expect(h.refreshes.map((r) => r.commandId)).toEqual(["c1", "c3"]);
    expect(h.sleeps).toEqual([15_000]);
    expect(h.refreshes[1]!.at).toBe(25_000);
  });

  it("drops a pending refresh when cancelled during the pacing wait (fog restored)", async () => {
    const h = harness();
    let scheduler!: ReturnType<typeof createFogLiveRefreshScheduler>;
    h.deps.sleep = async (ms) => { h.sleeps.push(ms); scheduler.cancelPending("p1"); };
    scheduler = createFogLiveRefreshScheduler(h.deps);
    scheduler.schedule("p1", "c1");
    await scheduler.inflight("p1");
    scheduler.schedule("p1", "c2");
    await scheduler.inflight("p1");
    expect(h.refreshes.map((r) => r.commandId)).toEqual(["c1"]);
  });

  it("skips the refresh once no socket is fog-disabled", async () => {
    const h = harness();
    h.setFogDisabled(false);
    h.scheduler.schedule("p1", "c1");
    await h.scheduler.inflight("p1");
    expect(h.refreshes).toEqual([]);
  });

  it("reports failures and keeps pacing after a failed refresh", async () => {
    const onRefreshFailed = vi.fn();
    const h = harness({ onRefreshFailed });
    h.deps.refresh = async () => { throw new Error("sim timeout"); };
    const scheduler = createFogLiveRefreshScheduler(h.deps);
    scheduler.schedule("p1", "c1");
    await scheduler.inflight("p1");
    scheduler.schedule("p1", "c2");
    await scheduler.inflight("p1");
    expect(onRefreshFailed).toHaveBeenCalledTimes(2);
    expect(h.sleeps).toEqual([15_000]);
    expect(scheduler.inflight("p1")).toBeUndefined();
  });
});

describe("fog live refresh helpers", () => {
  it("never lets a bad env value disable pacing", () => {
    expect(resolveFogLiveRefreshMinGapMs(undefined, undefined)).toBe(15_000);
    expect(resolveFogLiveRefreshMinGapMs(undefined, "abc")).toBe(15_000);
    expect(resolveFogLiveRefreshMinGapMs(undefined, "5000")).toBe(5_000);
    expect(resolveFogLiveRefreshMinGapMs(0, "abc")).toBe(0);
    expect(resolveFogLiveRefreshMinGapMs(undefined, "-1")).toBe(0);
  });

  it("clears fogDisabled on every socket and can restore each previous value", () => {
    const sessions = new Map([["a", { fogDisabled: true }], ["b", { fogDisabled: false }]]);
    const undo = clearFogDisabledForRestore(["a", "b", "gone"], (socket) => sessions.get(socket));
    expect([...sessions.values()].map((s) => s.fogDisabled)).toEqual([false, false]);
    undo();
    expect([...sessions.values()].map((s) => s.fogDisabled)).toEqual([true, false]);
  });
});
