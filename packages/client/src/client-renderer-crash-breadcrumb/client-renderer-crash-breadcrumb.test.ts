// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "border-empires-renderer-breadcrumb-v1";

// The module snapshots the previous session's breadcrumb at import time (so a
// late diagnostics download still reports it), which means each "session" in
// these tests has to be a fresh import against pre-seeded storage.
const loadSession = async () => {
  vi.resetModules();
  return import("./client-renderer-crash-breadcrumb.js");
};

const seed = (value: Record<string, unknown>): void => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
};

const stored = (): Record<string, unknown> => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");

describe("renderer crash breadcrumb", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("records the attempt before construction, so a killed tab still leaves evidence", async () => {
    const session = await loadSession();

    session.beginRendererAttempt(14000);

    expect(stored()).toMatchObject({ phase: "init-started", tileBudget: 14000, failedAttempts: 1 });
  });

  it("reports the previous session's phase — the only trace a hard crash leaves", async () => {
    seed({ atMs: 1, phase: "init-started", tileBudget: 14000, failedAttempts: 1 });

    const session = await loadSession();

    // Died during allocation: the memory-exhaustion signature.
    expect(session.previousRendererAttempt()).toMatchObject({ phase: "init-started", tileBudget: 14000 });
  });

  it("counts consecutive crashes across sessions", async () => {
    const first = await loadSession();
    first.beginRendererAttempt(14000);
    expect(stored().failedAttempts).toBe(1);

    // Tab dies here — nothing marks completion. Next load:
    const second = await loadSession();
    second.beginRendererAttempt(14000);
    expect(stored().failedAttempts).toBe(2);
  });

  it("skips 3d once the crash streak reaches the brake threshold", async () => {
    seed({ atMs: 1, phase: "init-started", tileBudget: 14000, failedAttempts: 2 });

    const session = await loadSession();

    expect(session.shouldSkipThreeDAfterCrashes()).toBe(true);
  });

  it("does not skip 3d after a single bad attempt — one can be a fluke", async () => {
    seed({ atMs: 1, phase: "init-started", tileBudget: 14000, failedAttempts: 1 });

    const session = await loadSession();

    expect(session.shouldSkipThreeDAfterCrashes()).toBe(false);
  });

  it("does not skip 3d when the last attempt survived", async () => {
    seed({ atMs: 1, phase: "survived", tileBudget: 14000, failedAttempts: 0 });

    const session = await loadSession();

    expect(session.shouldSkipThreeDAfterCrashes()).toBe(false);
  });

  it("clears the streak once 3d survives the danger window", async () => {
    seed({ atMs: 1, phase: "init-started", tileBudget: 6000, failedAttempts: 1 });
    const session = await loadSession();

    session.beginRendererAttempt(6000);
    session.markRendererInitCompleted(6000);
    expect(stored()).toMatchObject({ phase: "init-completed", failedAttempts: 2 });

    vi.advanceTimersByTime(8000);

    expect(stored()).toMatchObject({ phase: "survived", failedAttempts: 0 });
  });

  it("treats a caught failure as handled, not as a crash", async () => {
    seed({ atMs: 1, phase: "init-started", tileBudget: 6000, failedAttempts: 1 });
    const session = await loadSession();

    session.beginRendererAttempt(6000);
    session.markRendererAttemptHandled();

    // A failure the app caught and fell back from must not push the device
    // toward the crash brake — that brake is for deaths nothing can catch.
    expect(stored()).toMatchObject({ phase: "survived", failedAttempts: 0 });
  });

  it("updates the heartbeat timestamp and count without touching phase or the crash streak", async () => {
    seed({ atMs: 1, phase: "init-completed", tileBudget: 6000, failedAttempts: 1 });
    const session = await loadSession();

    session.recordRendererHeartbeat(6000);
    session.recordRendererHeartbeat(6000);

    expect(stored()).toMatchObject({ phase: "init-completed", failedAttempts: 1, heartbeatCount: 2 });
    expect(stored().lastHeartbeatAtMs).toBeTypeOf("number");
  });

  it("does nothing when a heartbeat fires with no prior attempt on record", async () => {
    const session = await loadSession();

    session.recordRendererHeartbeat(6000);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("marks the risky window around the first terrain rebuild, distinct from init-completed", async () => {
    seed({ atMs: 1, phase: "init-completed", tileBudget: 6000, failedAttempts: 1 });
    const session = await loadSession();

    session.markRendererFirstRenderStarted();

    // If the tab dies here, this is what the next load reads back — and it's
    // a different signature from "init-started" (died allocating buffers).
    expect(stored()).toMatchObject({ phase: "first-render-started", failedAttempts: 1 });
  });

  it("reverts to init-completed once the first rebuild returns without crashing", async () => {
    seed({ atMs: 1, phase: "init-completed", tileBudget: 6000, failedAttempts: 1 });
    const session = await loadSession();

    session.markRendererFirstRenderStarted();
    session.markRendererFirstRenderCompleted();

    expect(stored()).toMatchObject({ phase: "init-completed", failedAttempts: 1 });
  });

  it("still counts a death during the first render toward the crash-loop brake", async () => {
    seed({ atMs: 1, phase: "first-render-started", tileBudget: 6000, failedAttempts: 2 });

    const session = await loadSession();

    expect(session.shouldSkipThreeDAfterCrashes()).toBe(true);
  });

  it("flags an unclean end when a heartbeat exists with no matching clean shutdown", async () => {
    seed({ atMs: 1, phase: "survived", tileBudget: 6000, failedAttempts: 0, lastHeartbeatAtMs: 500 });

    const session = await loadSession();

    expect(session.previousSessionEndedUncleanly()).toBe(true);
  });

  it("does not flag a crash when the clean shutdown matches or postdates the last heartbeat", async () => {
    seed({
      atMs: 1,
      phase: "survived",
      tileBudget: 6000,
      failedAttempts: 0,
      lastHeartbeatAtMs: 500,
      cleanShutdownAtMs: 600
    });

    const session = await loadSession();

    expect(session.previousSessionEndedUncleanly()).toBe(false);
  });

  it("does not flag a crash when 3d never sent a heartbeat", async () => {
    seed({ atMs: 1, phase: "init-started", tileBudget: 6000, failedAttempts: 1 });

    const session = await loadSession();

    expect(session.previousSessionEndedUncleanly()).toBe(false);
  });

  it("records a clean shutdown on pagehide", async () => {
    seed({ atMs: 1, phase: "survived", tileBudget: 6000, failedAttempts: 0, lastHeartbeatAtMs: 500 });
    await loadSession();

    window.dispatchEvent(new Event("pagehide"));

    expect(stored().cleanShutdownAtMs).toBeTypeOf("number");
  });

  it("survives corrupted storage rather than blocking startup", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");

    const session = await loadSession();

    expect(session.previousRendererAttempt()).toBeUndefined();
    expect(session.shouldSkipThreeDAfterCrashes()).toBe(false);
  });
});
