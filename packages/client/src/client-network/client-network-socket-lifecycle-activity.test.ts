import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { RealtimeSocket, RealtimeSocketEventMap } from "../client-socket-types.js";
import { bindClientSocketLifecycle } from "./client-network-socket-lifecycle.js";

// Regression: a socket that closed while Chronicle's Yours or World request was
// in flight left that tab on "Loading…" for the rest of the session -- the
// answer could never arrive and the in-flight guard swallowed every reopen.
// Drives a real close event through the lifecycle so the wiring is covered,
// not just releaseActivityRequestsOnDisconnect in isolation.
const fakeSocket = () => {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const ws = {
    CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
    readyState: 3,
    send: vi.fn(),
    close: vi.fn(),
    reconnect: vi.fn(),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: vi.fn()
  } as unknown as RealtimeSocket;
  const emit = <K extends keyof RealtimeSocketEventMap>(type: K, event: Partial<RealtimeSocketEventMap[K]>): void => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  return { ws, emit };
};

describe("socket teardown with a Chronicle request in flight", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["close", "error"] as const)("a socket %s releases the Yours and World loading guards", (kind) => {
    vi.useFakeTimers();
    const state = createInitialState();
    state.activityDashboard.loading = true;
    state.activityDashboard.worldPulseLoading = true;
    const { ws, emit } = fakeSocket();
    bindClientSocketLifecycle({
      state, ws, wsUrl: "wss://example.test", keyFor: (x, y) => `${x},${y}`,
      clearAuthReconnectTimer: vi.fn(), resetAuthReconnectAttempt: vi.fn(), clearDeferredBootstrapRefreshTimer: vi.fn(),
      clearOptimisticTileState: vi.fn(), pushFeed: vi.fn(), applyLoginPhase: vi.fn(),
      authenticateSocket: vi.fn(async () => undefined), renderHud: vi.fn()
    });
    if (kind === "close") emit("close", { code: 1006, reason: "", wasClean: false });
    else emit("error", {});
    expect(state.activityDashboard.loading).toBe(false);
    expect(state.activityDashboard.worldPulseLoading).toBe(false);
    expect(state.activityDashboard.error).toBeDefined();
  });
});
