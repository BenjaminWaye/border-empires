import { describe, expect, it } from "vitest";
import { createPlayerUpdateEmitter } from "./runtime-player-update-emitter.js";
import { createMainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";

// Regression for the 2026-09-17 evening prod throttle: resolveLock emitted a
// PLAYER_UPDATE (= full per-player cache rebuild) per lock resolution, many
// times a second under muster auto-fire. The emitter must keep the first
// emit synchronous and collapse a burst into one trailing emit per window.
const harness = (windowMs: number) => {
  let now = 1_000;
  const timers: Array<{ at: number; task: () => void }> = [];
  const emits: Array<{ commandId: string; playerId: string; at: number }> = [];
  const after: string[] = [];
  const emitter = createPlayerUpdateEmitter({
    windowMs,
    now: () => now,
    scheduleAfter: (delayMs, task) => { timers.push({ at: now + delayMs, task }); },
    emit: (command, playerId) => { emits.push({ commandId: command.commandId, playerId, at: now }); },
    afterEmit: (playerId) => { after.push(playerId); }
  });
  const advance = (ms: number): void => {
    now += ms;
    for (const t of [...timers].sort((a, b) => a.at - b.at)) {
      if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.task(); }
    }
  };
  return { emitter, emits, after, timers, advance, nowMs: () => now };
};

describe("createPlayerUpdateEmitter", () => {
  it("windowMs=0 emits every request synchronously (runtime default, unit-test semantics)", () => {
    const h = harness(0);
    h.emitter.request({ commandId: "a", playerId: "p1" });
    h.emitter.request({ commandId: "b", playerId: "p1" });
    expect(h.emits.map((e) => e.commandId)).toEqual(["a", "b"]);
    expect(h.after).toEqual(["p1", "p1"]);
    expect(h.timers).toHaveLength(0);
  });

  it("emits the first request immediately and collapses a burst into one trailing emit with the latest commandId", () => {
    const h = harness(1_000);
    h.emitter.request({ commandId: "lock-1", playerId: "p1" });
    expect(h.emits.map((e) => e.commandId)).toEqual(["lock-1"]);
    for (let i = 2; i <= 20; i += 1) { h.advance(10); h.emitter.request({ commandId: `lock-${i}`, playerId: "p1" }); }
    expect(h.emits).toHaveLength(1);
    expect(h.emitter.pendingCount()).toBe(1);
    expect(h.timers).toHaveLength(1);
    // Trailing emit is due exactly one window after the leading emit.
    expect(h.timers[0]!.at - h.emits[0]!.at).toBe(1_000);
    h.advance(1_000);
    expect(h.emits.map((e) => e.commandId)).toEqual(["lock-1", "lock-20"]);
    expect(h.emitter.pendingCount()).toBe(0);
    expect(h.after).toEqual(["p1", "p1"]);
  });

  it("keeps players independent and starts a fresh window after the trailing emit", () => {
    const h = harness(1_000);
    h.emitter.request({ commandId: "a1", playerId: "attacker" });
    h.emitter.request({ commandId: "d1", playerId: "defender" });
    h.advance(100);
    h.emitter.request({ commandId: "a2", playerId: "attacker" });
    expect(h.emits.map((e) => `${e.playerId}:${e.commandId}`)).toEqual(["attacker:a1", "defender:d1"]);
    h.advance(1_000);
    expect(h.emits.map((e) => e.commandId)).toEqual(["a1", "d1", "a2"]);
    // Quiet for a full window: the next request is immediate again.
    h.advance(1_000);
    h.emitter.request({ commandId: "a3", playerId: "attacker" });
    expect(h.emits.map((e) => e.commandId)).toEqual(["a1", "d1", "a2", "a3"]);
  });

  it("reports a throwing trailing emit via onError instead of propagating out of the timer", () => {
    let now = 1_000;
    const timers: Array<() => void> = [];
    const errors: Array<{ error: unknown; playerId: string }> = [];
    let calls = 0;
    const emitter = createPlayerUpdateEmitter({
      windowMs: 1_000,
      now: () => now,
      scheduleAfter: (_delay, task) => { timers.push(task); },
      emit: () => { calls += 1; if (calls === 2) throw new Error("boom"); },
      onError: (error, playerId) => { errors.push({ error, playerId }); }
    });
    emitter.request({ commandId: "a", playerId: "p1" });
    emitter.request({ commandId: "b", playerId: "p1" });
    now += 1_000;
    expect(() => timers.shift()!()).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.playerId).toBe("p1");
    expect(emitter.pendingCount()).toBe(0);
    // The emitter is still usable afterwards.
    now += 1_000;
    emitter.request({ commandId: "c", playerId: "p1" });
    expect(calls).toBe(3);
  });

  it("flushAll emits pending updates immediately", () => {
    const h = harness(1_000);
    h.emitter.request({ commandId: "a1", playerId: "p1" });
    h.emitter.request({ commandId: "a2", playerId: "p1" });
    h.emitter.flushAll();
    expect(h.emits.map((e) => e.commandId)).toEqual(["a1", "a2"]);
    h.advance(1_000); // the armed timer finds nothing pending
    expect(h.emits).toHaveLength(2);
  });

  it("wraps each real emit in the emit_player_state_update phase when a tracker is supplied", () => {
    let now = 0;
    const tracker = createMainThreadTaskTracker({ now: () => now, minRetainedDurationMs: 0 });
    const emitter = createPlayerUpdateEmitter({
      windowMs: 0,
      now: () => now,
      scheduleAfter: () => {},
      emit: () => { now += 5; },
      trackSync: tracker.trackSync
    });
    emitter.request({ commandId: "x", playerId: "p1" });
    expect(tracker.recentSince(0).map((t) => t.phase)).toEqual(["emit_player_state_update"]);
  });
});

describe("main-thread task tracker ring buffer", () => {
  it("keeps the newest maxEntries snapshots in order without shifting", () => {
    let now = 0;
    const tracker = createMainThreadTaskTracker({ now: () => now, maxEntries: 3, minRetainedDurationMs: 0 });
    for (const phase of ["a", "b", "c", "d", "e"]) tracker.trackSync(phase, undefined, () => { now += 1; });
    expect(tracker.recentSince(0).map((t) => t.phase)).toEqual(["c", "d", "e"]);
  });
});
