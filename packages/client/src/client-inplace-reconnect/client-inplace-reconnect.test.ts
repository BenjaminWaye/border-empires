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

// A minimal fake `document` that actually dispatches to registered
// listeners, so tests can fire "visibilitychange"/"resume" the same way the
// real browser would instead of just asserting a listener got attached.
const stubFakeDocument = (initialVisibilityState: "visible" | "hidden") => {
  const listeners = new Map<string, Array<() => void>>();
  const fakeDocument = {
    visibilityState: initialVisibilityState,
    addEventListener: (type: string, listener: () => void) => {
      const existing = listeners.get(type) ?? [];
      existing.push(listener);
      listeners.set(type, existing);
    }
  };
  vi.stubGlobal("document", fakeDocument);
  return {
    setVisibilityState: (next: "visible" | "hidden") => {
      fakeDocument.visibilityState = next;
    },
    fire: (type: string) => {
      for (const listener of listeners.get(type) ?? []) listener();
    }
  };
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

  it("reconnects immediately when the tab becomes visible and the socket is not open/connecting", () => {
    const fakeDocument = stubFakeDocument("hidden");
    const state = createInitialState() as any;
    state.hasEverInitialized = true;
    const ws = createFakeSocket(3); // CLOSED
    createInPlaceReconnectScheduler({ state, ws });

    fakeDocument.setVisibilityState("visible");
    fakeDocument.fire("visibilitychange");

    expect(ws.reconnect).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect on visibilitychange before the app has ever finished its first boot", () => {
    const fakeDocument = stubFakeDocument("hidden");
    const state = createInitialState() as any;
    state.hasEverInitialized = false;
    const ws = createFakeSocket(3); // CLOSED
    createInPlaceReconnectScheduler({ state, ws });

    fakeDocument.setVisibilityState("visible");
    fakeDocument.fire("visibilitychange");

    expect(ws.reconnect).not.toHaveBeenCalled();
  });

  it("reconnects on the Page Lifecycle 'resume' event, same as visibilitychange", () => {
    // Chrome fires "resume" when a frozen background tab's JS starts running
    // again, which is a more direct signal than visibilitychange for the
    // long-backgrounded-tab case this scheduler exists to recover from.
    const fakeDocument = stubFakeDocument("visible");
    const state = createInitialState() as any;
    state.hasEverInitialized = true;
    const ws = createFakeSocket(3); // CLOSED
    createInPlaceReconnectScheduler({ state, ws });

    fakeDocument.fire("resume");

    expect(ws.reconnect).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect on visibilitychange or resume when the socket is already open", () => {
    const fakeDocument = stubFakeDocument("hidden");
    const state = createInitialState() as any;
    state.hasEverInitialized = true;
    const ws = createFakeSocket(1); // OPEN
    createInPlaceReconnectScheduler({ state, ws });

    fakeDocument.setVisibilityState("visible");
    fakeDocument.fire("visibilitychange");
    fakeDocument.fire("resume");

    expect(ws.reconnect).not.toHaveBeenCalled();
  });
});
