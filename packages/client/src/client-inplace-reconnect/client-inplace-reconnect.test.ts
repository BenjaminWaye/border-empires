import { afterEach, describe, expect, it, vi } from "vitest";

import { createInPlaceReconnectScheduler } from "./client-inplace-reconnect.js";
import { createInitialState } from "../client-state/client-state.js";
import type { RealtimeSocket } from "../client-socket-types.js";

const createFakeSocket = (readyState: number): RealtimeSocket & { reconnect: ReturnType<typeof vi.fn> } => {
  const socket = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    reconnect: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  return socket as unknown as RealtimeSocket & { reconnect: ReturnType<typeof vi.fn> };
};

describe("createInPlaceReconnectScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does nothing before the app has ever finished its first boot", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { reload }
    });

    const state = createInitialState() as any;
    state.hasEverInitialized = false;
    const ws = createFakeSocket(3);
    const scheduler = createInPlaceReconnectScheduler({ state, ws });

    scheduler.schedule();
    vi.runAllTimers();

    expect(ws.reconnect).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reconnects in place with backoff, then falls back to a reload after repeated failures", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const reload = vi.fn();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { reload }
    });

    const state = createInitialState() as any;
    state.hasEverInitialized = true;
    state.connection = "disconnected";
    const ws = createFakeSocket(3);
    const scheduler = createInPlaceReconnectScheduler({ state, ws });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      scheduler.schedule();
      vi.runOnlyPendingTimers();
    }
    expect(ws.reconnect).toHaveBeenCalledTimes(5);
    expect(reload).not.toHaveBeenCalled();

    scheduler.schedule();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("resetAttempt() restarts the backoff/fallback budget", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const reload = vi.fn();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { reload }
    });

    const state = createInitialState() as any;
    state.hasEverInitialized = true;
    state.connection = "disconnected";
    const ws = createFakeSocket(3);
    const scheduler = createInPlaceReconnectScheduler({ state, ws });

    scheduler.schedule();
    vi.runOnlyPendingTimers();
    scheduler.resetAttempt();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      scheduler.schedule();
      vi.runOnlyPendingTimers();
    }
    // Had resetAttempt() not restarted the budget, this would already have
    // exceeded MAX_INPLACE_RECONNECT_ATTEMPTS and reloaded instead.
    expect(reload).not.toHaveBeenCalled();
    expect(ws.reconnect).toHaveBeenCalledTimes(6);
  });
});
