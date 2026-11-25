// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { RealtimeSocket, RealtimeSocketEventMap } from "../client-socket-types.js";
import { createDeployStatusPoller } from "../client-deploy-countdown/client-deploy-status-poller.js";
import { buildMapLoadingView } from "../client-map-loading-view/client-map-loading-view.js";
import { bindClientSocketLifecycle } from "./client-network-socket-lifecycle.js";

const NOW = 1_800_000_000_000;

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

// A socket that drops during a deploy reads the status file and the in-game
// banner counts down; the next INIT ends the outage and the banner's
// countdown goes away.
describe("deploy countdown across a socket drop", () => {
  afterEach(() => vi.useRealTimers());

  it("switches the reconnect banner from countdown back to normal once recovered", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const state = createInitialState();
    state.hasEverInitialized = true;
    const fetchStatus = vi.fn(async () => ({ state: "deploying", startedAt: NOW - 40_000, expectedSeconds: 120 }));
    const renderHud = vi.fn();
    const syncAuthOverlay = vi.fn();
    const poller = createDeployStatusPoller({ state, fetchStatus, onChange: () => { renderHud(); syncAuthOverlay(); } });
    const { ws, emit } = fakeSocket();
    const lifecycle = bindClientSocketLifecycle({
      state, ws, wsUrl: "wss://example.test", keyFor: (x, y) => `${x},${y}`,
      clearAuthReconnectTimer: vi.fn(), resetAuthReconnectAttempt: vi.fn(), clearDeferredBootstrapRefreshTimer: vi.fn(),
      clearOptimisticTileState: vi.fn(), pushFeed: vi.fn(), applyLoginPhase: vi.fn(),
      authenticateSocket: vi.fn(async () => undefined), renderHud, syncAuthOverlay, deployStatusPoller: poller
    });

    emit("close", { code: 1006, reason: "", wasClean: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(buildMapLoadingView(state, "wss://example.test", Date.now()).title).toBe("Server update · back in ~1:20");
    expect(syncAuthOverlay).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(buildMapLoadingView(state, "wss://example.test", Date.now()).title).toBe("Server update · back in ~1:10");

    state.connection = "initialized";
    lifecycle.recovered();
    expect(state.deployStatus).toBeNull();
    state.connection = "disconnected";
    expect(buildMapLoadingView(state, "wss://example.test", Date.now()).title).not.toMatch(/Server update ·/);
  });
});
