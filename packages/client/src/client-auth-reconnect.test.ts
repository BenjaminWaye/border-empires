import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthReconnectScheduler } from "./client-auth-reconnect.js";
import { createInitialState } from "./client-state.js";
import type { RealtimeSocket } from "./client-socket-types.js";

const createOpenSocket = (): RealtimeSocket =>
  ({
    OPEN: 1,
    readyState: 1
  }) as unknown as RealtimeSocket;

describe("createAuthReconnectScheduler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("publishes retry countdown before rendering and resends auth when the timer fires", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const state = createInitialState();
    const authenticateSocket = vi.fn(async () => {});
    let detailAtRender = "";
    const scheduler = createAuthReconnectScheduler({
      state,
      ws: createOpenSocket(),
      firebaseAuth: { currentUser: { uid: "player-1" } },
      setAuthBusy: (busy) => {
        state.authBusy = busy;
      },
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      renderHud: () => {
        detailAtRender = state.authBusyDetail;
      },
      authenticateSocket
    });

    scheduler.schedule("Game server is still starting. Retrying sign-in...");

    expect(detailAtRender).toBe("Game server is still starting. Retrying sign-in... Attempt 1 starts in 2s.");
    expect(state.authRetryAttempt).toBe(1);
    vi.runOnlyPendingTimers();
    expect(authenticateSocket).toHaveBeenCalledTimes(1);
  });

  it("restarts attempt numbering after state is reset", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const state = createInitialState();
    const scheduler = createAuthReconnectScheduler({
      state,
      ws: createOpenSocket(),
      firebaseAuth: { currentUser: { uid: "player-1" } },
      setAuthBusy: (busy) => {
        state.authBusy = busy;
      },
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      renderHud: vi.fn(),
      authenticateSocket: vi.fn(async () => {})
    });

    scheduler.schedule("Retrying...");
    state.authRetrying = false;
    state.authRetryAttempt = 0;
    scheduler.schedule("Retrying...");

    expect(state.authRetryAttempt).toBe(1);
    expect(state.authBusyDetail).toBe("Retrying... Attempt 1 starts in 2s.");
  });
});
